import { redirect, useActionData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import {
  createRule,
  deleteRule,
  setDiscountGid,
  validateRule,
} from "../models/discountRule.server";
import { syncRule } from "../models/discount.server";
import RuleForm from "../components/RuleForm";

export const loader = async ({ request }) => {
  await authenticate.admin(request);
  return null;
};

export const action = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  const formData = await request.formData();

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

  const rule = await createRule(session.shop, input);

  // Only ACTIVE rules are published to Shopify. If the sync fails, roll the DB
  // row back so the merchant can fix the issue and re-create without duplicates.
  if (rule.status === "ACTIVE") {
    try {
      const discountGid = await syncRule(admin, rule);
      await setDiscountGid(session.shop, rule.id, discountGid);
    } catch (error) {
      await deleteRule(session.shop, rule.id);
      return { errors: { form: `Couldn't publish discount: ${error.message}` } };
    }
  }

  return redirect("/app?saved=created");
};

export default function NewRule() {
  const actionData = useActionData();

  return (
    <s-page heading="Create discount rule">
      <RuleForm mode="new" errors={actionData?.errors ?? {}} />
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
