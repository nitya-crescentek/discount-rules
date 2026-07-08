import { authenticate } from "../shopify.server";

// Mandatory GDPR/compliance webhook. Fires when a customer requests their data.
// This app stores no customer personal data — only shop-level discount rules —
// so there is nothing to return. We acknowledge to satisfy the requirement.
export const action = async ({ request }) => {
  const { shop, topic } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}: no customer data stored`);
  return new Response();
};
