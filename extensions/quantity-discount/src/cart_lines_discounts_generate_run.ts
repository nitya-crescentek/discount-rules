import {
  DiscountClass,
  ProductDiscountSelectionStrategy,
  CartInput,
  CartLinesDiscountsGenerateRunResult,
} from '../generated/api';

interface Tier {
  minQuantity: number;
  valueType: 'PERCENTAGE' | 'FIXED_AMOUNT';
  value: number;
}

// Written into the discount's `$app:function-configuration` metafield by the
// admin app (Phase 3). Collections selected in the admin are expanded to their
// member product IDs at save time, so here we only match a flat list of GIDs.
interface Configuration {
  productIds: string[];
  tiers: Tier[];
}

const NO_DISCOUNT: CartLinesDiscountsGenerateRunResult = {operations: []};

export function cartLinesDiscountsGenerateRun(
  input: CartInput,
): CartLinesDiscountsGenerateRunResult {
  // This function only produces product-class discounts.
  if (!input.discount.discountClasses.includes(DiscountClass.Product)) {
    return NO_DISCOUNT;
  }

  const raw = input.discount.metafield?.jsonValue;
  if (!raw) {
    return NO_DISCOUNT;
  }

  const config: Configuration = typeof raw === 'string' ? JSON.parse(raw) : raw;
  const tiers = config.tiers ?? [];
  const productIds = config.productIds ?? [];
  if (tiers.length === 0) {
    return NO_DISCOUNT;
  }

  const candidates: any[] = [];

  for (const line of input.cart.lines) {
    // Only product variants map to a product we can target.
    if (line.merchandise.__typename !== 'ProductVariant') {
      continue;
    }
    const productId = line.merchandise.product.id;

    // When productIds is configured, the line's product must be in the set.
    // An empty list means "apply to every product".
    if (productIds.length > 0 && !productIds.includes(productId)) {
      continue;
    }

    // Apply the highest tier whose minimum quantity this line satisfies.
    let bestTier: Tier | null = null;
    for (const tier of tiers) {
      if (
        line.quantity >= tier.minQuantity &&
        (bestTier === null || tier.minQuantity > bestTier.minQuantity)
      ) {
        bestTier = tier;
      }
    }
    if (bestTier === null) {
      continue;
    }

    const value =
      bestTier.valueType === 'FIXED_AMOUNT'
        ? {fixedAmount: {amount: bestTier.value, appliesToEachItem: true}}
        : {percentage: {value: bestTier.value}};

    const message =
      bestTier.valueType === 'FIXED_AMOUNT'
        ? `Buy ${bestTier.minQuantity}+ and save`
        : `Buy ${bestTier.minQuantity}+ and save ${bestTier.value}%`;

    candidates.push({
      message,
      targets: [{cartLine: {id: line.id}}],
      value,
    });
  }

  if (candidates.length === 0) {
    return NO_DISCOUNT;
  }

  return {
    operations: [
      {
        productDiscountsAdd: {
          candidates,
          // ALL: apply every candidate to its eligible cart line.
          selectionStrategy: ProductDiscountSelectionStrategy.All,
        },
      },
    ],
  };
}
