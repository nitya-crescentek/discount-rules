import { redirect, useActionData, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import {
  deleteRule,
  getRule,
  setDiscountGid,
  updateRule,
  validateRule,
} from "../models/discountRule.server";
import { deleteDiscount, syncRule } from "../models/discount.server";
import RuleForm from "../components/RuleForm";

export const loader = async ({ request, params }) => {
  const { session } = await authenticate.admin(request);
  const rule = await getRule(session.shop, params.id);
  if (!rule) {
    return redirect("/app");
  }
  return { rule };
};

export const action = async ({ request, params }) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = formData.get("intent");

  if (intent === "delete") {
    const existing = await getRule(session.shop, params.id);
    // Best-effort removal of the Shopify discount; still delete the DB row even
    // if the discount was already gone.
    if (existing?.discountGid) {
      try {
        await deleteDiscount(admin, existing.discountGid);
      } catch {
        // ignore — the DB row is the record we must clean up
      }
    }
    await deleteRule(session.shop, params.id);
    return redirect("/app?saved=deleted");
  }

  let input;
  try {
    input = JSON.parse(formData.get("payload") ?? "{}");
  } catch {
    return { errors: { form: "Something went wrong. Please try again." } };
  }

  const errors = validateRule(input);
  if (Object.keys(errors).length > 0) {
    return { errors };
  }

  const rule = await updateRule(session.shop, params.id, input);
  if (!rule) {
    return redirect("/app");
  }

  try {
    if (rule.status === "ACTIVE") {
      // Create on first activation, otherwise update the existing discount.
      const discountGid = await syncRule(admin, rule);
      if (discountGid !== rule.discountGid) {
        await setDiscountGid(session.shop, rule.id, discountGid);
      }
    } else if (rule.discountGid) {
      // Moved back to Draft — remove it from Shopify so it stops applying.
      await deleteDiscount(admin, rule.discountGid);
      await setDiscountGid(session.shop, rule.id, null);
    }
  } catch (error) {
    return { errors: { form: `Saved, but syncing to Shopify failed: ${error.message}` } };
  }

  return redirect("/app?saved=updated");
};

export default function EditRule() {
  const { rule } = useLoaderData();
  const actionData = useActionData();

  return (
    <s-page heading="Edit discount rule">
      <RuleForm mode="edit" rule={rule} errors={actionData?.errors ?? {}} />
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
