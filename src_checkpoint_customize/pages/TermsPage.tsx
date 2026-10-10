import { Layout, PageHeading, Accordion } from "../components";
import { useSEO } from "../seo";

export function TermsPage() {
  useSEO({ title: "Terms & Conditions - Litora", description: "Terms and conditions for Litora marketplace.", path: "/terms" });

  return (
    <Layout>
      <PageHeading title="Terms & Conditions" subtitle="Last updated: July 2026" />
      <div style={{ maxWidth: 700 }}>
        <Accordion title="1. Seller Agreement" defaultOpen>
          By becoming a seller on Litora, you agree to provide accurate information about your books, maintain the quality of your listings, and comply with all applicable laws and regulations. You are responsible for the content you publish and the transactions that result from your listings.
        </Accordion>
        <Accordion title="2. Commission Structure">
          Litora charges a commission on each sale, as agreed during your seller onboarding. The commission rate may vary per book. Monthly sales targets may apply, with bonuses for exceeding targets and adjustments for falling short. Commission rates are reviewed periodically.
        </Accordion>
        <Accordion title="3. Payouts">
          Sellers accumulate earnings from book sales. Payouts are processed when your owed balance reaches $100 or more. Partial payouts may be requested. All payouts are recorded and tracked in your seller dashboard. You will receive a notification when a payout is processed. Once a seller's payout balance is processed by admin, the $100 payout will be paid to the seller within 7 days.
        </Accordion>
        <Accordion title="4. Content Guidelines">
          All books listed on Litora must be original works or properly licensed. Prohibited content includes: plagiarized material, illegal content, hateful or discriminatory material, and content that violates intellectual property rights. Litora reserves the right to remove any listing that violates these guidelines.
        </Accordion>
        <Accordion title="5. Account Management">
          Sellers can edit their profile information once during their account lifetime. Additional changes require contacting support. Admin reserves the right to suspend or delete accounts that violate terms. Password resets can be initiated from the login page or by admin request.
        </Accordion>
        <Accordion title="6. Privacy">
          We collect and store your email, shop name, and sales data to operate the marketplace. We do not sell your personal information to third parties. Your data is protected using industry-standard security measures.
        </Accordion>
        <Accordion title="7. Liability">
          Litora is not liable for the content of individual book listings. Sellers are solely responsible for their books and customer satisfaction. Litora facilitates a secure platform for independent authors and bookstores but is not a party to individual transactions between sellers and buyers. Founded to connect independent authors and bookstores globally, Litora is built to be a trusted global marketplace — if you have concerns, reach us at hello@litora.com.
        </Accordion>
        <Accordion title="8. Author Earnings & Payouts">
          Authors earn a commission on each sale of their assigned books, calculated from each book's individual commission rate. Earnings accumulate in your author dashboard. Payouts are processed when your owed balance reaches $100 or more. Partial payouts may be requested — for example, if you are owed $60, the admin may pay $50 and the remaining $10 stays visible on both your dashboard and the admin's view. All payouts are recorded and tracked in your author dashboard, and your total historical sales and books sold remain visible even after a payout is marked. You will receive a notification when a payout is processed. Once an author's payout balance is processed by admin, the payout will be paid within 7 days.
        </Accordion>
        <Accordion title="9. Platform & Payout Fee">
          A Platform & Payout Fee (currently set per seller/author, typically around 7%) will be deducted from each payout to partially recover payment gateway charges, international transfer fees, currency conversion costs, compliance expenses, and platform operating costs.
        </Accordion>
        <Accordion title="10. Events & Programs">
          Litora may host events and programs (such as a Student Ambassador Program) that users can apply to join. To apply, you must be logged in and submit the application form linked to the event. After submitting, your application enters a review queue. Admin will review your application and notify you within 72 hours whether you have been selected. Approved applicants are added to the event or program. Rejected applications are removed from the queue. Submitting an application does not guarantee selection. The admin reserves the right to approve or reject applications at their discretion.
        </Accordion>
        <Accordion title="11. Changes to Terms">
          These terms may be updated periodically. Sellers will be notified of significant changes. Continued use of the platform after changes constitutes acceptance of the updated terms.
        </Accordion>
      </div>
    </Layout>
  );
}
