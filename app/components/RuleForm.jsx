/* eslint-disable react/prop-types */
import { useState } from "react";
import { useNavigate, useNavigation, useSubmit } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";

const STATUS = { DRAFT: "DRAFT", ACTIVE: "ACTIVE" };
const TARGET_TYPE = { PRODUCT: "PRODUCT", COLLECTION: "COLLECTION" };
const VALUE_TYPE = { PERCENTAGE: "PERCENTAGE", FIXED_AMOUNT: "FIXED_AMOUNT" };

const emptyTier = () => ({ minQuantity: "", value: "" });

// Converts a stored ISO date to the "YYYY-MM-DD" value an s-date-field expects.
function toDateInput(value) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

// Shared create/edit form for a quantity discount rule. Keeps all values in
// local state and submits them as a single JSON `payload` field; the route
// action validates and persists. `errors` holds server-side field messages.
export default function RuleForm({ mode = "new", rule, errors = {} }) {
  const submit = useSubmit();
  const navigate = useNavigate();
  const navigation = useNavigation();
  const shopify = useAppBridge();

  const isSubmitting = navigation.state === "submitting";

  const [title, setTitle] = useState(rule?.title ?? "");
  const [status, setStatus] = useState(rule?.status ?? STATUS.DRAFT);
  const [targetType, setTargetType] = useState(
    rule?.targetType ?? TARGET_TYPE.PRODUCT,
  );
  const [targets, setTargets] = useState(rule?.targets ?? []);
  const [discountType, setDiscountType] = useState(
    rule?.tiers?.[0]?.valueType ?? VALUE_TYPE.PERCENTAGE,
  );
  const [tiers, setTiers] = useState(
    rule?.tiers?.length
      ? rule.tiers.map((t) => ({
          minQuantity: String(t.minQuantity),
          value: String(t.value),
        }))
      : [emptyTier()],
  );
  const [scheduled, setScheduled] = useState(
    Boolean(rule?.startsAt || rule?.endsAt),
  );
  const [startsAt, setStartsAt] = useState(toDateInput(rule?.startsAt));
  const [endsAt, setEndsAt] = useState(toDateInput(rule?.endsAt));
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const targetNoun =
    targetType === TARGET_TYPE.COLLECTION ? "collection" : "product";
  const isPercentage = discountType === VALUE_TYPE.PERCENTAGE;

  // Changing the target type invalidates the current selection (picker differs).
  function onTargetTypeChange(next) {
    setTargetType(next);
    setTargets([]);
  }

  async function pickTargets() {
    const selection = await shopify.resourcePicker({
      type: targetType === TARGET_TYPE.COLLECTION ? "collection" : "product",
      multiple: true,
      selectionIds: targets.map((t) => ({ id: t.id })),
    });
    if (selection) {
      setTargets(selection.map((r) => ({ id: r.id, title: r.title })));
    }
  }

  function updateTier(index, patch) {
    setTiers((prev) =>
      prev.map((tier, i) => (i === index ? { ...tier, ...patch } : tier)),
    );
  }

  function addTier() {
    setTiers((prev) => [...prev, emptyTier()]);
  }

  function removeTier(index) {
    setTiers((prev) => prev.filter((_, i) => i !== index));
  }

  function save() {
    const payload = {
      title,
      status,
      targetType,
      targets,
      discountType,
      tiers,
      startsAt: scheduled ? startsAt : "",
      endsAt: scheduled ? endsAt : "",
    };
    submit(
      { intent: "save", payload: JSON.stringify(payload) },
      { method: "post" },
    );
  }

  function destroy() {
    submit({ intent: "delete" }, { method: "post" });
  }

  return (
    <s-stack direction="block" gap="large">
      {errors.form && (
        <s-banner tone="critical" heading="Couldn't save rule">
          {errors.form}
        </s-banner>
      )}

      <s-section heading="Details">
        <s-stack direction="block" gap="base">
          <s-text-field
            label="Title"
            name="title"
            value={title}
            placeholder="e.g. Bulk pricing for wholesale tees"
            error={errors.title || undefined}
            onChange={(e) => setTitle(e.target.value)}
          ></s-text-field>

          <s-select
            label="Status"
            name="status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <s-option value={STATUS.DRAFT}>Draft — not applied at checkout</s-option>
            <s-option value={STATUS.ACTIVE}>Active — live on your store</s-option>
          </s-select>
        </s-stack>
      </s-section>

      <s-section heading="Applies to">
        <s-stack direction="block" gap="base">
          <s-select
            label="Target type"
            name="targetType"
            value={targetType}
            onChange={(e) => onTargetTypeChange(e.target.value)}
          >
            <s-option value={TARGET_TYPE.PRODUCT}>Specific products</s-option>
            <s-option value={TARGET_TYPE.COLLECTION}>Collections</s-option>
          </s-select>

          <s-stack direction="inline" gap="base" alignItems="center">
            <s-button onClick={pickTargets}>Select {targetNoun}s</s-button>
            <s-text color="subdued">
              {targets.length
                ? `${targets.length} ${targetNoun}${targets.length === 1 ? "" : "s"} selected`
                : `No ${targetNoun}s selected`}
            </s-text>
          </s-stack>

          {errors.targets && <s-text tone="critical">{errors.targets}</s-text>}

          {targets.length > 0 && (
            <s-stack direction="block" gap="small-300">
              {targets.map((t) => (
                <s-box
                  key={t.id}
                  padding="small-200"
                  background="subdued"
                  borderRadius="base"
                >
                  <s-stack direction="inline" gap="base" alignItems="center">
                    <s-text>{t.title}</s-text>
                    <s-button
                      variant="tertiary"
                      onClick={() =>
                        setTargets((prev) => prev.filter((x) => x.id !== t.id))
                      }
                    >
                      Remove
                    </s-button>
                  </s-stack>
                </s-box>
              ))}
            </s-stack>
          )}
        </s-stack>
      </s-section>

      <s-section heading="Quantity tiers">
        <s-stack direction="block" gap="base">
          <s-select
            label="Discount type"
            name="discountType"
            value={discountType}
            onChange={(e) => setDiscountType(e.target.value)}
          >
            <s-option value={VALUE_TYPE.PERCENTAGE}>Percentage (%)</s-option>
            <s-option value={VALUE_TYPE.FIXED_AMOUNT}>
              Fixed amount per item
            </s-option>
          </s-select>

          <s-paragraph color="subdued">
            The highest tier a line item&apos;s quantity qualifies for is applied.
          </s-paragraph>

          {errors.tiers && <s-text tone="critical">{errors.tiers}</s-text>}

          {tiers.map((tier, index) => (
            <s-stack key={index} direction="inline" gap="base" alignItems="end">
              <s-number-field
                label="Min quantity"
                name="minQuantity"
                min={1}
                step={1}
                inputMode="numeric"
                value={tier.minQuantity}
                onChange={(e) =>
                  updateTier(index, { minQuantity: e.target.value })
                }
              ></s-number-field>

              <s-number-field
                label={isPercentage ? "Discount (%)" : "Discount (amount)"}
                name="value"
                min={0}
                value={tier.value}
                onChange={(e) => updateTier(index, { value: e.target.value })}
              ></s-number-field>

              <s-button
                variant="tertiary"
                tone="critical"
                onClick={() => removeTier(index)}
                {...(tiers.length === 1 ? { disabled: true } : {})}
              >
                Remove
              </s-button>
            </s-stack>
          ))}

          <s-stack direction="inline">
            <s-button variant="secondary" onClick={addTier}>
              Add tier
            </s-button>
          </s-stack>
        </s-stack>
      </s-section>

      <s-section heading="Schedule">
        <s-stack direction="block" gap="base">
          <s-switch
            label="Schedule a start and end date"
            name="scheduled"
            {...(scheduled ? { checked: true } : {})}
            onChange={(e) => setScheduled(e.target.checked)}
          ></s-switch>

          {scheduled && (
            <s-stack direction="inline" gap="base" alignItems="end">
              <s-date-field
                label="Start date"
                name="startsAt"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
              ></s-date-field>
              <s-date-field
                label="End date (optional)"
                name="endsAt"
                value={endsAt}
                error={errors.schedule || undefined}
                onChange={(e) => setEndsAt(e.target.value)}
              ></s-date-field>
            </s-stack>
          )}
        </s-stack>
      </s-section>

      {confirmingDelete && (
        <s-banner tone="warning" heading="Delete this rule?">
          <s-stack direction="block" gap="base">
            <s-paragraph>
              This removes the automatic discount from your store. This can&apos;t
              be undone.
            </s-paragraph>
            <s-stack direction="inline" gap="base">
              <s-button variant="primary" tone="critical" onClick={destroy}>
                Delete rule
              </s-button>
              <s-button
                variant="tertiary"
                onClick={() => setConfirmingDelete(false)}
              >
                Cancel
              </s-button>
            </s-stack>
          </s-stack>
        </s-banner>
      )}

      <s-stack direction="inline" gap="base">
        <s-button
          variant="primary"
          onClick={save}
          {...(isSubmitting ? { loading: true } : {})}
        >
          {mode === "edit" ? "Save changes" : "Create rule"}
        </s-button>
        <s-button variant="tertiary" onClick={() => navigate("/app/rules")}>
          Cancel
        </s-button>
        {mode === "edit" && !confirmingDelete && (
          <s-button
            variant="tertiary"
            tone="critical"
            onClick={() => setConfirmingDelete(true)}
            {...(isSubmitting ? { disabled: true } : {})}
          >
            Delete rule
          </s-button>
        )}
      </s-stack>
    </s-stack>
  );
}
