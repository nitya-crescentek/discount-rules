import { authenticate } from "../shopify.server";

// Mandatory GDPR/compliance webhook. Fires when a customer's data must be erased.
// This app stores no customer personal data, so there is nothing to redact.
export const action = async ({ request }) => {
  const { shop, topic } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}: no customer data to redact`);
  return new Response();
};
