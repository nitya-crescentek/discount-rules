import { redirect } from "react-router";
import { authenticate } from "../shopify.server";

// The app has a single admin surface: /app/rules. Opening the app lands here,
// so send it straight through.
export const loader = async ({ request }) => {
  await authenticate.admin(request);

  return redirect("/app/rules");
};

export default function Index() {
  return null;
}
