import { Routes, Route } from "react-router-dom";
import { HomePage } from "./pages/HomePage";
import { BookDetailPage } from "./pages/BookDetailPage";
import { BecomeSellerPage } from "./pages/BecomeSellerPage";
import { BecomeAuthorPage } from "./pages/BecomeAuthorPage";
import { SellerLoginPage, AdminLoginPage, AuthorLoginPage, NotFoundPage } from "./pages/AuthPages";
import { SellerDashboardPage } from "./pages/SellerDashboardPage";
import { AuthorDashboardPage } from "./pages/AuthorDashboardPage";
import { AdminDashboardPage } from "./pages/AdminDashboardPage";
import { AdminAuthorsPage } from "./pages/AdminAuthorsPage";
import { TermsPage } from "./pages/TermsPage";
import { EventsPage } from "./pages/EventsPage";
import { CustomizeSellerPage } from "./pages/CustomizeSellerPage";
import { AdminSellerViewPage } from "./pages/AdminSellerViewPage";
import { StudentLoginPage } from "./pages/StudentLoginPage";
import { StudentDashboardPage } from "./pages/StudentDashboardPage";

function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/events" element={<EventsPage />} />
      <Route path="/book/:id" element={<BookDetailPage />} />
      <Route path="/become-seller" element={<BecomeSellerPage />} />
      <Route path="/become-author" element={<BecomeAuthorPage />} />
      <Route path="/seller/login" element={<SellerLoginPage />} />
      <Route path="/seller/dashboard" element={<SellerDashboardPage />} />
      <Route path="/admin/login" element={<AdminLoginPage />} />
      <Route path="/admin" element={<AdminDashboardPage />} />
      <Route path="/admin/authors" element={<AdminAuthorsPage />} />
      <Route path="/admin/customize-seller/:id" element={<CustomizeSellerPage />} />
      <Route path="/admin/seller-view/:id" element={<AdminSellerViewPage />} />
      <Route path="/author/login" element={<AuthorLoginPage />} />
      <Route path="/author/dashboard" element={<AuthorDashboardPage />} />
      <Route path="/student/login" element={<StudentLoginPage />} />
      <Route path="/student/dashboard" element={<StudentDashboardPage />} />
      <Route path="/terms" element={<TermsPage />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

export default App;
