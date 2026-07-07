// Shopify-side sync for discount rules. The Prisma DB is the editable source of
// truth (see discountRule.server.js); this module mirrors an ACTIVE rule into a
// Shopify automatic app discount backed by the `quantity-discount` function, and
// writes the tier config into the discount's metafield for the function to read.

import { TARGET_TYPE } from "./discountRule.server";

// Must match the namespace/key the function reads in
// extensions/quantity-discount/src/cart_lines_discounts_generate_run.graphql
const CONFIG_NAMESPACE = "$app";
const CONFIG_KEY = "function-configuration";
// Matches the extension's locale name (extensions/quantity-discount/locales).
const FUNCTION_TITLE = "Quantity discount";

const GET_FUNCTIONS = `#graphql
  query GetDiscountFunctions {
    shopifyFunctions(first: 50) {
      nodes {
        id
        title
        apiType
      }
    }
  }`;

const CREATE_DISCOUNT = `#graphql
  mutation CreateAutomaticDiscount($discount: DiscountAutomaticAppInput!) {
    discountAutomaticAppCreate(automaticAppDiscount: $discount) {
      automaticAppDiscount {
        discountId
      }
      userErrors {
        field
        message
      }
    }
  }`;

const UPDATE_DISCOUNT = `#graphql
  mutation UpdateAutomaticDiscount($id: ID!, $discount: DiscountAutomaticAppInput!) {
    discountAutomaticAppUpdate(id: $id, automaticAppDiscount: $discount) {
      automaticAppDiscount {
        discountId
      }
      userErrors {
        field
        message
      }
    }
  }`;

const DELETE_DISCOUNT = `#graphql
  mutation DeleteAutomaticDiscount($id: ID!) {
    discountAutomaticDelete(id: $id) {
      deletedAutomaticDiscountId
      userErrors {
        field
        message
      }
    }
  }`;

const SET_CONFIG = `#graphql
  mutation SetDiscountConfig($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      metafields {
        id
      }
      userErrors {
        field
        message
      }
    }
  }`;

const COLLECTION_PRODUCTS = `#graphql
  query CollectionProductIds($id: ID!, $cursor: String) {
    collection(id: $id) {
      products(first: 250, after: $cursor) {
        nodes {
          id
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  }`;

async function graphql(admin, query, variables) {
  const response = await admin.graphql(query, { variables });
  return response.json();
}

function throwUserErrors(errors, context) {
  if (errors && errors.length > 0) {
    throw new Error(`${context}: ${errors.map((e) => e.message).join("; ")}`);
  }
}

// Finds the deployed quantity-discount function's id. Available once the app has
// been run with `shopify app dev` or deployed with `shopify app deploy`.
async function getFunctionId(admin) {
  const json = await graphql(admin, GET_FUNCTIONS);
  const nodes = json?.data?.shopifyFunctions?.nodes ?? [];
  const match =
    nodes.find((n) => n.title === FUNCTION_TITLE) ??
    nodes.find((n) => n.apiType === "discount") ??
    nodes[0];
  if (!match) {
    throw new Error(
      "Discount function not found on this store. Run `shopify app dev` or `shopify app deploy` so the function is available, then try again.",
    );
  }
  return match.id;
}

async function collectionProductIds(admin, collectionId) {
  const ids = [];
  let cursor = null;
  // Cap pagination so a huge collection can't loop unbounded (Phase 4 can add
  // webhook-based membership sync for very large collections).
  for (let page = 0; page < 40; page++) {
    const json = await graphql(admin, COLLECTION_PRODUCTS, {
      id: collectionId,
      cursor,
    });
    const connection = json?.data?.collection?.products;
    if (!connection) break;
    for (const node of connection.nodes) ids.push(node.id);
    if (!connection.pageInfo.hasNextPage) break;
    cursor = connection.pageInfo.endCursor;
  }
  return ids;
}

// Resolves a rule's targets to the flat product-GID list the function matches
// against. Collections are expanded to their current member products.
async function resolveProductIds(admin, rule) {
  if (rule.targetType === TARGET_TYPE.COLLECTION) {
    const ids = new Set();
    for (const target of rule.targets) {
      const productIds = await collectionProductIds(admin, target.id);
      productIds.forEach((id) => ids.add(id));
    }
    return [...ids];
  }
  return rule.targets.map((t) => t.id);
}

function discountInput(rule) {
  return {
    title: rule.title,
    startsAt: rule.startsAt
      ? new Date(rule.startsAt).toISOString()
      : new Date().toISOString(),
    endsAt: rule.endsAt ? new Date(rule.endsAt).toISOString() : null,
    discountClasses: ["PRODUCT"],
    combinesWith: {
      orderDiscounts: true,
      productDiscounts: false,
      shippingDiscounts: true,
    },
  };
}

async function writeConfig(admin, discountGid, productIds, tiers) {
  const value = JSON.stringify({
    productIds,
    tiers: tiers.map((t) => ({
      minQuantity: t.minQuantity,
      valueType: t.valueType,
      value: t.value,
    })),
  });
  const json = await graphql(admin, SET_CONFIG, {
    metafields: [
      {
        ownerId: discountGid,
        namespace: CONFIG_NAMESPACE,
        key: CONFIG_KEY,
        type: "json",
        value,
      },
    ],
  });
  throwUserErrors(json?.data?.metafieldsSet?.userErrors, "Saving discount config");
}

// Creates or updates the Shopify automatic discount for a rule and writes its
// tier config. Returns the discount GID (existing or newly created).
export async function syncRule(admin, rule) {
  const productIds = await resolveProductIds(admin, rule);

  let discountGid = rule.discountGid;

  if (discountGid) {
    const json = await graphql(admin, UPDATE_DISCOUNT, {
      id: discountGid,
      discount: discountInput(rule),
    });
    throwUserErrors(
      json?.data?.discountAutomaticAppUpdate?.userErrors,
      "Updating discount",
    );
  } else {
    const functionId = await getFunctionId(admin);
    const json = await graphql(admin, CREATE_DISCOUNT, {
      discount: { ...discountInput(rule), functionId },
    });
    const payload = json?.data?.discountAutomaticAppCreate;
    throwUserErrors(payload?.userErrors, "Creating discount");
    discountGid = payload?.automaticAppDiscount?.discountId;
    if (!discountGid) {
      throw new Error("Creating discount: Shopify did not return a discount id.");
    }
  }

  await writeConfig(admin, discountGid, productIds, rule.tiers);
  return discountGid;
}

export async function deleteDiscount(admin, discountGid) {
  const json = await graphql(admin, DELETE_DISCOUNT, { id: discountGid });
  throwUserErrors(
    json?.data?.discountAutomaticDelete?.userErrors,
    "Deleting discount",
  );
}
