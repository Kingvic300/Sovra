import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { DAppKitProvider } from '@mysten/dapp-kit-react'
import { createBrowserRouter } from 'react-router'
import { RouterProvider } from 'react-router/dom'
import '@fontsource-variable/hanken-grotesk'
import './index.css'
import { MarketingLayout } from '@/components/marketing/marketing-layout'
import { AppLayout } from '@/components/shell/app-layout'
import { RootLayout } from '@/components/shell/root-layout'
import { dAppKit } from '@/lib/dapp-kit'
import AccountsPage from '@/pages/accounts'
import AskPage from '@/pages/ask'
import AuthPage from '@/pages/auth'
import BudgetsPage from '@/pages/budgets'
import GoalsPage from '@/pages/goals'
import FaqPage from '@/pages/marketing/faq'
import HomePage from '@/pages/marketing/home'
import HowItWorksPage from '@/pages/marketing/how-it-works'
import SecurityPage from '@/pages/marketing/security'
import MemoryPage from '@/pages/memory'
import NotFoundPage from '@/pages/not-found'
import OnboardingPage from '@/pages/onboarding'
import OverviewPage from '@/pages/overview'
import PrivacyPage from '@/pages/privacy'
import ProfilePage from '@/pages/profile'
import RecurringPage from '@/pages/recurring'
import RouteErrorPage from '@/pages/route-error'
import TermsPage from '@/pages/terms'
import TransactionsPage from '@/pages/transactions'

const router = createBrowserRouter([
  {
    element: <RootLayout />,
    errorElement: <RouteErrorPage />,
    children: [
      // Marketing
      {
        element: <MarketingLayout />,
        children: [
          { index: true, element: <HomePage /> },
          { path: 'how-it-works', element: <HowItWorksPage /> },
          { path: 'security', element: <SecurityPage /> },
          { path: 'faq', element: <FaqPage /> },
        ],
      },
      // Auth and legal
      { path: 'signin', element: <AuthPage mode="signin" /> },
      { path: 'signup', element: <AuthPage mode="signup" /> },
      { path: 'terms', element: <TermsPage /> },
      { path: 'privacy', element: <PrivacyPage /> },
      // Signed in
      { path: 'onboarding', element: <OnboardingPage /> },
      {
        path: 'app',
        element: <AppLayout />,
        children: [
          { index: true, element: <OverviewPage /> },
          { path: 'transactions', element: <TransactionsPage /> },
          { path: 'budgets', element: <BudgetsPage /> },
          { path: 'goals', element: <GoalsPage /> },
          { path: 'recurring', element: <RecurringPage /> },
          { path: 'accounts', element: <AccountsPage /> },
          { path: 'memory', element: <MemoryPage /> },
          { path: 'ask', element: <AskPage /> },
          { path: 'profile', element: <ProfilePage /> },
        ],
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
])

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <DAppKitProvider dAppKit={dAppKit}>
      <RouterProvider router={router} />
    </DAppKitProvider>
  </StrictMode>,
)
