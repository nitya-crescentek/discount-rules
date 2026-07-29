import { useEffect } from "react";
import { useLoaderData, useNavigate, useSearchParams } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { useAppBridge } from "@shopify/app-bridge-react";
import { authenticate } from "../shopify.server";
import { getRules } from "../models/discountRule.server";

export const loader = async ({ request }) => {
  const { session } = await authenticate.admin(request);
  const rules = await getRules(session.shop);
  return { rules };
};

const SAVED_MESSAGES = {
  created: "Discount rule created",
  updated: "Discount rule updated",
  deleted: "Discount rule deleted",
};

function discountSummary(tiers) {
  if (!tiers.length) return "No tiers";
  const count = `${tiers.length} tier${tiers.length === 1 ? "" : "s"}`;
  const max = Math.max(...tiers.map((t) => t.value));
  const formatted =
    tiers[0].valueType === "PERCENTAGE" ? `${max}%` : `$${max}`;
  return `${count} · up to ${formatted} off`;
}

function scheduleLabel(rule) {
  if (!rule.startsAt && !rule.endsAt) return null;
  const fmt = (v) =>
    new Date(v).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  if (rule.startsAt && rule.endsAt)
    return `${fmt(rule.startsAt)} – ${fmt(rule.endsAt)}`;
  if (rule.startsAt) return `From ${fmt(rule.startsAt)}`;
  return `Until ${fmt(rule.endsAt)}`;
}

export default function RulesIndex() {
  const { rules } = useLoaderData();
  const navigate = useNavigate();
  const shopify = useAppBridge();
  const [searchParams, setSearchParams] = useSearchParams();

  // Surface a toast after a create/update/delete redirect, then drop the param.
  const saved = searchParams.get("saved");
  useEffect(() => {
    if (saved && SAVED_MESSAGES[saved]) {
      shopify.toast.show(SAVED_MESSAGES[saved]);
      setSearchParams({}, { replace: true });
    }
  }, [saved, shopify, setSearchParams]);

  return (
    <s-page heading="Discount rules">
      <s-button slot="primary-action" onClick={() => navigate("/app/rules/new")}>
        Create rule
      </s-button>

      {rules.length === 0 ? (
        <s-section heading="No discount rules yet">
          <s-stack direction="block" gap="base">
            <s-paragraph>
              Create a quantity discount rule to automatically reward customers
              for buying more. For example, buy 5 and save 10%.
            </s-paragraph>
            <s-stack direction="inline">
              <s-button
                variant="primary"
                onClick={() => navigate("/app/rules/new")}
              >
                Create rule
              </s-button>
            </s-stack>
          </s-stack>
        </s-section>
      ) : (
        <s-section heading="All rules">
          <s-table variant="auto">
            <s-table-header-row>
              <s-table-header listSlot="primary">Title</s-table-header>
              <s-table-header>Status</s-table-header>
              <s-table-header>Applies to</s-table-header>
              <s-table-header>Discount</s-table-header>
              <s-table-header></s-table-header>
            </s-table-header-row>
            <s-table-body>
              {rules.map((rule) => {
                const schedule = scheduleLabel(rule);
                const noun =
                  rule.targetType === "COLLECTION" ? "collection" : "product";
                return (
                  <s-table-row key={rule.id}>
                    <s-table-cell>
                      <s-stack direction="block" gap="small-500">
                        <s-text>{rule.title}</s-text>
                        {schedule && (
                          <s-text color="subdued">{schedule}</s-text>
                        )}
                      </s-stack>
                    </s-table-cell>
                    <s-table-cell>
                      <s-badge
                        {...(rule.status === "ACTIVE"
                          ? { tone: "success" }
                          : {})}
                      >
                        {rule.status === "ACTIVE" ? "Active" : "Draft"}
                      </s-badge>
                    </s-table-cell>
                    <s-table-cell>
                      {rule.targets.length}{" "}
                      {`${noun}${rule.targets.length === 1 ? "" : "s"}`}
                    </s-table-cell>
                    <s-table-cell>{discountSummary(rule.tiers)}</s-table-cell>
                    <s-table-cell>
                      <s-button
                        variant="tertiary"
                        onClick={() => navigate(`/app/rules/${rule.id}`)}
                      >
                        Edit
                      </s-button>
                    </s-table-cell>
                  </s-table-row>
                );
              })}
            </s-table-body>
          </s-table>
        </s-section>
      )}
    </s-page>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
