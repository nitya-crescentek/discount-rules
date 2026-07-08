import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }) => {
  const { shop, session, topic } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  // Webhook requests can trigger multiple times and after an app has already been uninstalled.
  // If this webhook already ran, the session may have been deleted previously.
  if (session) {
    await db.session.deleteMany({ where: { shop } });
  }

  // Flag the store as uninstalled in the tenant registry. Rules are kept so the
  // merchant's config survives a reinstall; afterAuth reactivates the Shop.
  await db.shop.updateMany({
    where: { domain: shop },
    data: { active: false, uninstalledAt: new Date() },
  });

  return new Response();
};
