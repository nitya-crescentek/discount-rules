import prisma from "../db.server";

export const STATUS = { DRAFT: "DRAFT", ACTIVE: "ACTIVE" };
export const TARGET_TYPE = { PRODUCT: "PRODUCT", COLLECTION: "COLLECTION" };
export const VALUE_TYPE = { PERCENTAGE: "PERCENTAGE", FIXED_AMOUNT: "FIXED_AMOUNT" };

// Shape stored/edited by the UI is friendlier than the raw Prisma row:
// `targets` is an array of { id, title } and tiers are plain objects. These
// helpers translate between that shape and the database.
function serializeRule(rule) {
  if (!rule) return null;
  let targets = [];
  try {
    targets = JSON.parse(rule.targets ?? "[]");
  } catch {
    targets = [];
  }
  return {
    id: rule.id,
    shop: rule.shop,
    title: rule.title,
    status: rule.status,
    targetType: rule.targetType,
    targets,
    discountGid: rule.discountGid,
    startsAt: rule.startsAt,
    endsAt: rule.endsAt,
    createdAt: rule.createdAt,
    updatedAt: rule.updatedAt,
    tiers: (rule.tiers ?? [])
      .slice()
      .sort((a, b) => a.minQuantity - b.minQuantity)
      .map((t) => ({
        minQuantity: t.minQuantity,
        valueType: t.valueType,
        value: t.value,
      })),
  };
}

export async function getRules(shop) {
  const rules = await prisma.discountRule.findMany({
    where: { shop },
    include: { tiers: true },
    orderBy: { updatedAt: "desc" },
  });
  return rules.map(serializeRule);
}

export async function getRule(shop, id) {
  const rule = await prisma.discountRule.findFirst({
    where: { id, shop },
    include: { tiers: true },
  });
  return serializeRule(rule);
}

// Accepts "YYYY-MM-DD" (from s-date-field) or a full ISO string, returns a Date
// or null. End dates snap to end-of-day so the schedule includes that day.
function parseDate(value, endOfDay) {
  if (!value) return null;
  const str = String(value);
  const withTime = str.includes("T")
    ? str
    : `${str}T${endOfDay ? "23:59:59" : "00:00:00"}Z`;
  const date = new Date(withTime);
  return Number.isNaN(date.getTime()) ? null : date;
}

// Normalizes raw form input into the fields we persist. Returns clean values;
// call validateRule() first to surface any problems to the merchant.
function normalize(input) {
  const targets = Array.isArray(input.targets)
    ? input.targets
        .filter((t) => t && t.id)
        .map((t) => ({ id: String(t.id), title: String(t.title ?? "") }))
    : [];

  // A rule uses a single discount type for all of its tiers.
  const discountType =
    input.discountType === VALUE_TYPE.FIXED_AMOUNT
      ? VALUE_TYPE.FIXED_AMOUNT
      : VALUE_TYPE.PERCENTAGE;

  const tiers = Array.isArray(input.tiers)
    ? input.tiers.map((t) => ({
        minQuantity: Math.trunc(Number(t.minQuantity)),
        valueType: discountType,
        value: Number(t.value),
      }))
    : [];

  return {
    title: (input.title ?? "").trim(),
    status: input.status === STATUS.ACTIVE ? STATUS.ACTIVE : STATUS.DRAFT,
    targetType:
      input.targetType === TARGET_TYPE.COLLECTION
        ? TARGET_TYPE.COLLECTION
        : TARGET_TYPE.PRODUCT,
    targets,
    discountType,
    tiers,
    startsAt: parseDate(input.startsAt, false),
    endsAt: parseDate(input.endsAt, true),
  };
}

// Returns an object of { field: message }. Empty object means valid.
export function validateRule(input) {
  const data = normalize(input);
  const errors = {};

  if (!data.title) errors.title = "Title is required.";

  if (data.targets.length === 0) {
    errors.targets = `Select at least one ${data.targetType.toLowerCase()}.`;
  }

  if (data.tiers.length === 0) {
    errors.tiers = "Add at least one quantity tier.";
  } else {
    const seen = new Set();
    for (const tier of data.tiers) {
      if (!Number.isInteger(tier.minQuantity) || tier.minQuantity < 1) {
        errors.tiers = "Each tier needs a minimum quantity of 1 or more.";
        break;
      }
      if (seen.has(tier.minQuantity)) {
        errors.tiers = `Two tiers share the same minimum quantity (${tier.minQuantity}).`;
        break;
      }
      seen.add(tier.minQuantity);

      if (!Number.isFinite(tier.value) || tier.value <= 0) {
        errors.tiers = "Each tier needs a discount value greater than 0.";
        break;
      }
      if (tier.valueType === VALUE_TYPE.PERCENTAGE && tier.value > 100) {
        errors.tiers = "Percentage discounts can't exceed 100%.";
        break;
      }
    }

    // A higher quantity threshold should reward the customer more, otherwise the
    // ladder is confusing (the function always applies the highest tier reached).
    if (!errors.tiers) {
      const sorted = [...data.tiers].sort(
        (a, b) => a.minQuantity - b.minQuantity,
      );
      for (let i = 1; i < sorted.length; i++) {
        if (sorted[i].value <= sorted[i - 1].value) {
          errors.tiers =
            "Each higher quantity tier must give a bigger discount than the tier below it.";
          break;
        }
      }
    }
  }

  if (data.startsAt && data.endsAt && data.endsAt <= data.startsAt) {
    errors.schedule = "The end date must be after the start date.";
  }

  return errors;
}

export async function createRule(shop, input) {
  const data = normalize(input);
  const rule = await prisma.discountRule.create({
    data: {
      shop,
      title: data.title,
      status: data.status,
      targetType: data.targetType,
      targets: JSON.stringify(data.targets),
      startsAt: data.startsAt,
      endsAt: data.endsAt,
      tiers: { create: data.tiers },
    },
    include: { tiers: true },
  });
  return serializeRule(rule);
}

export async function updateRule(shop, id, input) {
  const data = normalize(input);
  // Ensure the rule belongs to this shop before mutating.
  const existing = await prisma.discountRule.findFirst({ where: { id, shop } });
  if (!existing) return null;

  // Tiers are small and fully replaced on each edit — simplest correct approach.
  const rule = await prisma.discountRule.update({
    where: { id },
    data: {
      title: data.title,
      status: data.status,
      targetType: data.targetType,
      targets: JSON.stringify(data.targets),
      startsAt: data.startsAt,
      endsAt: data.endsAt,
      tiers: { deleteMany: {}, create: data.tiers },
    },
    include: { tiers: true },
  });
  return serializeRule(rule);
}

export async function deleteRule(shop, id) {
  const result = await prisma.discountRule.deleteMany({ where: { id, shop } });
  return result.count > 0;
}

// Records (or clears) the Shopify automatic discount GID after syncing.
export async function setDiscountGid(shop, id, discountGid) {
  await prisma.discountRule.updateMany({
    where: { id, shop },
    data: { discountGid },
  });
}
