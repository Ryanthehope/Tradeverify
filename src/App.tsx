import { Navigate, Route, Routes, useParams } from "react-router-dom";
import { Layout } from "./components/Layout";
// import { GuideArticle } from "./pages/GuideArticle";
// import { GuidesIndex } from "./pages/GuidesIndex";
import { Contact } from "./pages/Contact";
import { Home } from "./pages/Home";
import { Join } from "./pages/Join";
import { Login } from "./pages/Login";
import { Privacy } from "./pages/Privacy";
import { Terms } from "./pages/Terms";
import { LookupMiss } from "./pages/LookupMiss";
import { MemberProfile } from "./pages/MemberProfile";

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
          {/* Removed leads, reviews, quotes, invoices, jobs, availability routes */}
          {/* leads, reviews, quotes, invoices, jobs, availability removed */}
          {/* Removed staff guides route */}
          <Route path="analytics" element={<StaffAnalytics />} />
          <Route path="settings" element={<StaffSettingsPage />} />
        </Route>

        <Route
          path="staff"
          element={
            <StaffRequireAuth>
              <StaffLayout />
            </StaffRequireAuth>
          }
        >
          <Route index element={<StaffDashboard />} />
          <Route path="financial" element={<div>Financial section coming soon</div>} />
          <Route path="applications" element={<StaffApplications />} />
          <Route path="members" element={<StaffMembers />} />
          <Route path="insurance" element={<StaffInsurance />} />
          <Route path="analytics" element={<StaffAnalytics />} />
          <Route path="settings" element={<StaffSettingsPage />} />
          <Route path="team" element={<div>Staff team section coming soon</div>} />
        </Route>

        <Route element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="m/:slug" element={<MemberProfile />} />
          <Route path="lookup/miss" element={<LookupMiss />} />
          <Route path="join" element={<Join />} />
          {/* Removed post-job route */}
          {/* Guides/advice routes removed */}
          <Route path="privacy" element={<Privacy />} />
          <Route path="terms" element={<Terms />} />
          <Route path="contact" element={<Contact />} />
        </Route>
      </Routes>
      </MemberAuthProvider>
    </StaffAuthProvider>
  );
}
