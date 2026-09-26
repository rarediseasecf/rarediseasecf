import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import WalletConnectionProvider from './providers/WalletConnectionProvider'
import { WalletSessionProvider } from './providers/WalletSessionProvider'
import { ReviewerSessionProvider } from './providers/ReviewerSessionProvider'
import SiteHeader from './components/SiteHeader'
import SiteFooter from './components/SiteFooter'
import HomePage from './pages/HomePage'
import CampaignsPage from './pages/CampaignsPage'
import CampaignDetailPage from './pages/CampaignDetailPage'
import SubmitPage from './pages/SubmitPage'
import CaseStatusPage from './pages/CaseStatusPage'
import ReviewerPage from './pages/ReviewerPage'
import ReviewerCaseDetailPage from './pages/ReviewerCaseDetailPage'
import HospitalVerifyPage from './pages/HospitalVerifyPage'
import AdminHospitalsPage from './pages/AdminHospitalsPage'
import TransparencyPage from './pages/TransparencyPage'
import ProviderConfirmPage from './pages/ProviderConfirmPage'
import PrivacyPage from './pages/PrivacyPage'

export default function App() {
  return (
    <WalletConnectionProvider>
      <WalletSessionProvider>
        <ReviewerSessionProvider>
          <BrowserRouter>
            <a href="#main-content" className="skip-link">
              Skip to main content
            </a>

            <SiteHeader />

            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/campaigns" element={<CampaignsPage />} />
              <Route path="/campaigns/:campaignId" element={<CampaignDetailPage />} />
              <Route path="/submit" element={<SubmitPage />} />
              <Route path="/submit/status" element={<CaseStatusPage />} />
              <Route path="/submit/status/:publicCaseId" element={<CaseStatusPage />} />
              <Route path="/verify/:token" element={<HospitalVerifyPage />} />
              <Route path="/admin/hospitals" element={<AdminHospitalsPage />} />
              <Route path="/transparency" element={<TransparencyPage />} />
              <Route
                path="/transparency/:campaignId"
                element={<TransparencyPage />}
              />
              <Route path="/reviewer" element={<ReviewerPage />} />
              <Route path="/reviewer/cases/:publicCaseId" element={<ReviewerCaseDetailPage />} />
              <Route path="/provider/:campaignId" element={<ProviderConfirmPage />} />
              <Route path="/privacy" element={<PrivacyPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>

            <SiteFooter />
          </BrowserRouter>
        </ReviewerSessionProvider>
      </WalletSessionProvider>
    </WalletConnectionProvider>
  )
}
