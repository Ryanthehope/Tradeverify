import { Navigate, Route, Routes, useParams } from "react-router-dom";
import { Layout } from "./components/Layout";
import { GuideArticle } from "./pages/GuideArticle";
import { GuidesIndex } from "./pages/GuidesIndex";
import { Contact } from "./pages/Contact";
import { Home } from "./pages/Home";
import { Join } from "./pages/Join";
import { Login } from "./pages/Login";
import { Privacy } from "./pages/Privacy";
import { Terms } from "./pages/Terms";
import { LookupMiss } from "./pages/LookupMiss";
import { MemberProfile } from "./pages/MemberProfile";
import { PostJob } from "./pages/PostJob";
import { StaffAuthProvider } from "./staff/StaffAuthContext";
import { StaffDashboard } from "./staff/StaffDashboard";
import { StaffGuideForm } from "./staff/StaffGuideForm";
import { StaffGuides } from "./staff/StaffGuides";
import { StaffLayout } from "./staff/StaffLayout";
import { StaffLogin } from "./staff/StaffLogin";
import { StaffMemberForm } from "./staff/StaffMemberForm";
import { StaffMembers } from "./staff/StaffMembers";
import { StaffAnalytics } from "./staff/StaffAnalytics";
import { StaffApplications } from "./staff/StaffApplications";
import { StaffInsurance } from "./staff/StaffInsurance";
import { StaffRequireAuth } from "./staff/StaffRequireAuth";
import { StaffSettingsPage } from "./staff/StaffSettingsPage";
import {  MemberAuthProvider,
  MemberBilling,
  MemberBusiness,
  MemberDocuments,
  MemberInsurance,
  MemberLayout,
  MemberLogin,
  MemberOverview,
  MemberPassword,
  MemberRequireAuth,
} from "./member";

function MemberRedirectQuotes() {
  return <Navigate to="/member/quotes-invoices/quotes" replace />;
}

function MemberRedirectInvoices() {
  return <Navigate to="/member/quotes-invoices/invoices" replace />;
}

function MemberRedirectQuotePrint() {
  const { id } = useParams();
  return (
    <Navigate to={`/member/quotes-invoices/quotes/${id}/print`} replace />
  );
}

function MemberRedirectInvoicePrint() {
  const { id } = useParams();
  return (
    <Navigate to={`/member/quotes-invoices/invoices/${id}/print`} replace />
  );
}

export default function App() {
  return (
    <StaffAuthProvider>
      <MemberAuthProvider>
      <Routes>
        <Route path="login" element={<Login />} />
        <Route path="member/login" element={<MemberLogin />} />
        <Route
          path="member"
          element={
            <MemberRequireAuth>
              <MemberLayout />
            </MemberRequireAuth>
          }
        >
          <Route index element={<MemberOverview />} />
          <Route path="business" element={<MemberBusiness />} />
          <Route path="documents" element={<MemberDocuments />} />
          <Route path="insurance" element={<MemberInsurance />} />
          {/* badge, refer, membership removed */}
          <Route path="billing" element={<MemberBilling />} />
          <Route path="password" element={<MemberPassword />} />
          <Route path="leads" element={<MemberLeads />} />
          <Route path="reviews" element={<MemberReviews />} />
          <Route path="quotes-invoices" element={<MemberQuotesInvoicesShell />}>
            <Route
              index
              element={<Navigate to="/member/quotes-invoices/quotes" replace />}
            />
            <Route path="quotes" element={<MemberQuotes />} />
            <Route path="invoices" element={<MemberTradeInvoices />} />
          </Route>
          <Route
            path="quotes-invoices/quotes/:id/print"
            element={<MemberQuotePrint />}
          />
          <Route
            path="quotes-invoices/invoices/:id/print"
            element={<MemberInvoicePrint />}
          />
          <Route path="quotes" element={<MemberRedirectQuotes />} />
          <Route path="quotes/:id/print" element={<MemberRedirectQuotePrint />} />
          <Route path="trade-invoices" element={<MemberRedirectInvoices />} />
          <Route
            path="trade-invoices/:id/print"
            element={<MemberRedirectInvoicePrint />}
          />
          {/* leads, reviews, quotes, invoices, jobs, availability removed */}
          <Route path="guides/:id" element={<StaffGuideForm />} />
          <Route path="analytics" element={<StaffAnalytics />} />
          <Route path="team" element={<StaffTeam />} />
          <Route path="integrations" element={<StaffIntegrations />} />
          <Route path="settings" element={<StaffSettingsPage />} />
          <Route path="system" element={<StaffSystem />} />
        </Route>

        <Route element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="m/:slug" element={<MemberProfile />} />
          <Route path="lookup/miss" element={<LookupMiss />} />
          <Route path="join" element={<Join />} />
          <Route path="post-job" element={<PostJob />} />
          <Route path="guides" element={<GuidesIndex />} />
          <Route path="guides/:slug" element={<GuideArticle />} />
          <Route path="privacy" element={<Privacy />} />
          <Route path="terms" element={<Terms />} />
          <Route path="contact" element={<Contact />} />
        </Route>
      </Routes>
      </MemberAuthProvider>
    </StaffAuthProvider>
  );
}
