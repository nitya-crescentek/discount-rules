import { authenticate } from "../shopify.server";
import db from "../db.server";

// Mandatory GDPR/compliance webhook. Fires ~48h after a shop uninstalls, when
// all of the shop's data must be erased. Deleting the Shop row cascades to its
// discount rules and tiers; sessions are removed explicitly.
export const action = async ({ request }) => {
  const { shop, topic } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}: erasing all shop data`);

  await db.discountRule.deleteMany({ where: { shop } });
  await db.session.deleteMany({ where: { shop } });
  await db.shop.deleteMany({ where: { domain: shop } });

  return new Response();
};
