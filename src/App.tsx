import React, { useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { useRouteContext, navigateTo } from './hooks/useRouteContext';
import { LoginPage } from './components/auth/LoginPage';
import { VerifyEmailPage } from './components/auth/VerifyEmailPage';
import { ResetPasswordPage } from './components/auth/ResetPasswordPage';
import { CreateOrganizationPage } from './components/auth/CreateOrganizationPage';
import { SetOrganizationCountryModal } from './components/auth/SetOrganizationCountryModal';
import { ThemeSetupOnboardingPage } from './components/onboarding/ThemeSetupOnboardingPage';
import { AcceptInvitePage } from './components/auth/AcceptInvitePage';
import { DashboardLayout } from './components/layout/DashboardLayout';
import { PublicEventGameView } from './components/events/PublicEventGameView';
import { PublicShowcaseView } from './components/events/PublicShowcaseView';
import { EventPreviewGameView } from './components/events/EventPreviewGameView';
import { DeveloperAdminPage } from './components/developer/DeveloperAdminPage';
import { LandingPage } from './components/landing/LandingPage';
import { ContactPage } from './components/contact/ContactPage';
import { SeoLandingPage } from './components/seo/SeoLandingPage';
import { PublicGamesPage } from './components/seo/PublicGamesPage';
import { PublicGameDetailPage } from './components/seo/PublicGameDetailPage';
import { PublicShowcasesIndexPage } from './components/seo/PublicShowcasesIndexPage';
import { SalesGamesPage } from './components/sales/SalesGamesPage';
import { SalesGameDetailPage } from './components/sales/SalesGameDetailPage';
import { SalesReferralsPage } from './components/sales/SalesReferralsPage';
import { SalesCommissionsPage } from './components/sales/SalesCommissionsPage';
import { SalesDashboardPage } from './components/sales/SalesDashboardPage';
import { SalesCustomersPage } from './components/sales/SalesCustomersPage';
import { SalesPartnerApplyPage } from './components/sales/SalesPartnerApplyPage';
import { SalesNavbar } from './components/sales/SalesNavbar';
import { SEO } from './components/common/SEO';
import { NotificationProvider } from './context/NotificationContext';
import { NotificationCenterModal } from './components/notifications/NotificationCenterModal';
import { LocalizationProvider, useLocalization } from './context/LocalizationContext';
import { matchesMainSection, getSafeRedirectUrl } from './lib/navigation';
import { ShieldAlert } from 'lucide-react';

const AppContent: React.FC = () => {
  const {
    isAuthenticated,
    isLoading,
    currentOrganization,
    organizations,
    cancelCreateOrganization,
    currentUser,
    isSalesPartner,
    salesPartnerStatus,
  } = useAuth();
  const { t } = useLocalization();
  const routeContext = useRouteContext();

  const isPublicRoute =
    routeContext.mode === 'public_event' ||
    routeContext.mode === 'public_showcase' ||
    routeContext.mode === 'public_showcases' ||
    routeContext.mode === 'public_games' ||
    routeContext.mode === 'public_game_detail' ||
    routeContext.mode === 'seo_landing' ||
    routeContext.mode === 'accept_invite' ||
    routeContext.mode === 'landing' ||
    routeContext.mode === 'contact' ||
    routeContext.mode === 'verify_email' ||
    routeContext.mode === 'reset_password' ||
    routeContext.mode === 'sales_apply';

  const isLoginRoute = routeContext.mode === 'login';
  const isProtectedRoute = !isPublicRoute && !isLoginRoute;

  // ROUTE GUARD: Enforce authentication and role constraints across all routes
  useEffect(() => {
    // Wait until session restoration has finished
    if (isLoading) return;

    if (isAuthenticated) {
      const isDesigner = currentOrganization?.role === 'designer';
      const defaultLanding = isDesigner ? '/games' : '/events';

      // 1. Authenticated user visiting /login -> redirect automatically to validated redirectUrl or default landing
      if (isLoginRoute) {
        const queryRedirect = new URLSearchParams(window.location.search).get('redirect');
        const sessionRedirect = typeof window !== 'undefined' ? window.sessionStorage?.getItem('pending_auth_redirect') : null;
        const candidate = queryRedirect || sessionRedirect || defaultLanding;
        const redirectUrl = getSafeRedirectUrl(candidate, defaultLanding);
        try {
          window.sessionStorage?.removeItem('pending_auth_redirect');
        } catch {}
        navigateTo(redirectUrl);
      } else if (routeContext.mode === 'developer_admin' && !currentUser?.is_developer) {
        // 2. Non-developer visiting /developer -> redirect to default landing
        navigateTo(defaultLanding);
      } else if (routeContext.mode === 'create_org' && currentOrganization) {
        // 3. User with active organization on create_org route -> redirect to default landing
        console.log('[App] Active organization present on create_org route, transitioning to landing');
        navigateTo(defaultLanding);
      } else if (!currentOrganization && organizations.length > 0 && routeContext.mode !== 'create_org') {
        // 3.5. Existing user with memberships where active organization is temporarily null -> restore active organization
        console.log('[App] Restoring active organization from memberships list');
        cancelCreateOrganization();
      } else if (isDesigner) {
        const path = window.location.pathname;
        if (
          matchesMainSection(path, '/events') ||
          matchesMainSection(path, '/wallet') ||
          matchesMainSection(path, '/wallet/top-up') ||
          matchesMainSection(path, '/team') ||
          routeContext.mode === 'event_preview'
        ) {
          navigateTo('/games');
        }
      } else if (currentOrganization?.role === 'viewer') {
        const path = window.location.pathname;
        if (matchesMainSection(path, '/team')) {
          navigateTo('/events');
        } else if (matchesMainSection(path, '/wallet/top-up')) {
          navigateTo('/wallet');
        }
      }
    } else {
      // 4. Unauthenticated user visiting a protected route -> preserve destination safely and redirect to /login
      if (isProtectedRoute) {
        const currentTarget = window.location.pathname + window.location.search;
        const safeTarget = getSafeRedirectUrl(currentTarget, '/events');
        try {
          window.sessionStorage?.setItem('pending_auth_redirect', safeTarget);
        } catch {}
        navigateTo(`/login?redirect=${encodeURIComponent(safeTarget)}`);
      }
    }
  }, [isLoading, isAuthenticated, isLoginRoute, isProtectedRoute, routeContext.mode, currentUser?.is_developer, currentOrganization, organizations.length, cancelCreateOrganization]);

  // 1. PUBLIC EVENT ROUTE: /play/:publicToken or /e/:publicToken (Unauthenticated Public Player View)
  if (routeContext.mode === 'public_event') {
    return (
      <>
        <SEO robots="noindex, nofollow" title={`${t('common.interactiveEventGames', undefined, 'Event Game')} | Event Game Studio`} />
        <PublicEventGameView />
      </>
    );
  }

  // 1.2. PUBLIC SHOWCASE SINGLE VIEW: /showcase/:showcaseId (Unauthenticated Public Showcase View)
  if (routeContext.mode === 'public_showcase') {
    return <PublicShowcaseView />;
  }

  // 1.3. PUBLIC SHOWCASES DIRECTORY: /showcase
  if (routeContext.mode === 'public_showcases') {
    return <PublicShowcasesIndexPage />;
  }

  // 1.4. PUBLIC SOLUTIONS SEO PAGES (e.g. /interactive-event-games, /corporate-event-games, etc.)
  if (routeContext.mode === 'seo_landing') {
    return <SeoLandingPage pathname={routeContext.pathname} />;
  }

  // 1.5. PUBLIC GAMES CATALOG: /game-showcase
  if (routeContext.mode === 'public_games') {
    return <PublicGamesPage />;
  }

  // 1.6. PUBLIC GAME DETAIL PAGES: /game-showcase/:gameSlug (e.g. /game-showcase/catch-the-brand)
  if (routeContext.mode === 'public_game_detail') {
    return <PublicGameDetailPage slugKey={routeContext.publicGameSlug || ''} />;
  }

  // 1.7. AUTHENTICATED EVENT PREVIEW ROUTE: /events/:eventId/preview
  if (routeContext.mode === 'event_preview') {
    if (currentOrganization?.role === 'designer') {
      navigateTo('/games');
      return null;
    }
    return (
      <>
        <SEO robots="noindex, follow" title={`${t('common.preview', undefined, 'Event Preview')} | Event Game Studio`} />
        <EventPreviewGameView />
      </>
    );
  }

  // 2. ACCEPT INVITE ROUTE
  if (routeContext.mode === 'accept_invite') {
    return (
      <>
        <SEO robots="noindex, follow" title={`${t('auth.acceptInvitation', undefined, 'Accept Invitation')} | Event Game Studio`} />
        <AcceptInvitePage />
      </>
    );
  }

  // 3. PUBLIC MARKETING LANDING PAGE: / (Accessible with or without authentication)
  if (routeContext.mode === 'landing') {
    return <LandingPage />;
  }

  // 3.5. PUBLIC CONTACT PAGE: /contact (Accessible with or without authentication)
  if (routeContext.mode === 'contact') {
    return <ContactPage />;
  }

  // 3.6. PUBLIC EMAIL VERIFICATION PAGE: /verify-email
  if (routeContext.mode === 'verify_email') {
    return <VerifyEmailPage />;
  }

  // 3.7. PUBLIC PASSWORD RESET PAGE: /reset-password
  if (routeContext.mode === 'reset_password') {
    return <ResetPasswordPage />;
  }

  // 3.8. PUBLIC SALES PARTNER APPLICATION ROUTE: /sales/apply, /partner, /become-a-partner
  if (routeContext.mode === 'sales_apply') {
    return <SalesPartnerApplyPage />;
  }

  // 4. AUTH & SESSION INITIALIZATION LOADING STATE
  if (isLoading) {
    return (
      <div className="min-w-screen min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center font-sans space-y-3">
        <SEO robots="noindex, follow" />
        <div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-xs text-slate-400 font-medium">{t('common.loadingApp', undefined, 'Loading Event Game Studio...')}</p>
      </div>
    );
  }

  // 5. UNAUTHENTICATED USERS: Always show LoginPage with noindex
  if (!isAuthenticated) {
    return (
      <>
        <SEO robots="noindex, follow" title={`${t('auth.signIn', undefined, 'Sign In')} | Event Game Studio`} />
        <LoginPage />
      </>
    );
  }

  // 6. AUTHENTICATED GUARD FOR /login (Never render LoginPage when authenticated)
  if (isLoginRoute) {
    return (
      <div className="min-w-screen min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center font-sans space-y-3">
        <SEO robots="noindex, follow" />
        <div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-xs text-slate-400 font-medium">{t('common.redirecting', undefined, 'Redirecting to Events...')}</p>
      </div>
    );
  }

  // 7. DEVELOPER ADMIN ROUTE GUARD
  if (routeContext.mode === 'developer_admin') {
    if (!currentUser?.is_developer) {
      return (
        <div className="min-w-screen min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center font-sans p-4">
          <SEO robots="noindex, follow" title={`${t('common.accessDenied', undefined, 'Access Denied')} | Event Game Studio`} />
          <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 text-center space-y-4 shadow-2xl">
            <div className="w-12 h-12 rounded-full bg-rose-500/20 text-rose-400 flex items-center justify-center mx-auto border border-rose-500/30">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <h1 className="text-xl font-bold text-white">{t('common.accessDenied', undefined, 'Access Denied')}</h1>
            <p className="text-sm text-slate-400 leading-relaxed">
              {t('developer.accessDeniedDesc', undefined, 'You do not have developer permissions to access the Developer Admin portal.')}
            </p>
            <div className="pt-2">
              <button
                onClick={() => navigateTo('/events')}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs rounded-xl transition-colors cursor-pointer"
              >
                {t('common.returnToEvents', undefined, 'Return to Events')}
              </button>
            </div>
          </div>
        </div>
      );
    }
    return (
      <>
        <SEO robots="noindex, follow" title={`${t('developer.adminPortal', undefined, 'Developer Admin')} | Event Game Studio`} />
        <DeveloperAdminPage />
      </>
    );
  }

  // 7.5. SALES PARTNER ROUTE GUARD & WORKSPACE
  if (
    routeContext.isSalesRoute ||
    routeContext.mode === 'sales_dashboard' ||
    routeContext.mode === 'sales_games' ||
    routeContext.mode === 'sales_game_detail' ||
    routeContext.mode === 'sales_referrals' ||
    routeContext.mode === 'sales_commissions' ||
    routeContext.mode === 'sales_customers'
  ) {
    if (!isSalesPartner) {
      return (
        <div className="min-w-screen min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center font-sans p-4">
          <SEO robots="noindex, follow" title={t('auth.salesPartnerAccessTitle')} />
          <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 text-center space-y-4 shadow-2xl">
            <div className="w-12 h-12 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center mx-auto border border-amber-500/30">
              <ShieldAlert className="w-6 h-6" />
            </div>
            <h1 className="text-xl font-bold text-white">{t('auth.salesPartnerAccessRequired')}</h1>
            <p className="text-sm text-slate-400 leading-relaxed">
              {salesPartnerStatus === 'pending'
                ? t('auth.salesPartnerPendingDesc')
                : salesPartnerStatus === 'suspended'
                ? t('auth.salesPartnerSuspendedDesc')
                : salesPartnerStatus === 'rejected'
                ? t('auth.salesPartnerRejectedDesc')
                : t('auth.salesPartnerNoAccessDesc')}
            </p>
            <div className="pt-2 flex flex-col sm:flex-row justify-center gap-3">
              <button
                onClick={() => navigateTo('/events')}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs rounded-xl transition-colors cursor-pointer"
              >
                {t('auth.returnToWorkspace')}
              </button>
              {salesPartnerStatus === null ? (
                <button
                  onClick={() => navigateTo('/sales/apply')}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl transition-all shadow-lg shadow-amber-500/20 cursor-pointer"
                >
                  {t('auth.applyToBecomePartner')}
                </button>
              ) : (
                <button
                  onClick={() => navigateTo('/sales/apply')}
                  className="px-4 py-2 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 font-semibold text-xs rounded-xl transition-colors cursor-pointer"
                >
                  {t('auth.viewApplicationStatus')}
                </button>
              )}
            </div>
          </div>
        </div>
      );
    }

    // 1. Sales Game Catalogue Route: /sales/games
    if (routeContext.mode === 'sales_games') {
      return <SalesGamesPage />;
    }

    // 2. Sales Game Detail Route: /sales/games/:gameId
    if (routeContext.mode === 'sales_game_detail') {
      return <SalesGameDetailPage gameId={routeContext.salesGameId || ''} />;
    }

    // 3. Sales Referrals & Customer Attributions Route: /sales/referrals or /sales/attributions
    if (routeContext.mode === 'sales_referrals' || routeContext.salesSection === 'referrals') {
      return <SalesReferralsPage />;
    }

    // 3.5. Sales Commissions & Payouts Route: /sales/commissions or /sales/payouts
    if (routeContext.mode === 'sales_commissions' || routeContext.salesSection === 'commissions') {
      return <SalesCommissionsPage />;
    }

    // 3.8. Sales Customers Route: /sales/customers or /sales/clients
    if (routeContext.mode === 'sales_customers' || routeContext.salesSection === 'customers') {
      return <SalesCustomersPage />;
    }

    // 4. Sales Partner Dashboard Route: /sales or /sales/dashboard or /sales/portal
    return <SalesDashboardPage />;
  }

  // 8. ONBOARDING / CREATE ORGANIZATION ROUTE
  // Once currentOrganization exists, CreateOrganizationPage must no longer render (Requirement 6).
  if (!currentOrganization) {
    // If the authenticated user already has organizations and is NOT on /create-organization,
    // do not flash or render CreateOrganizationPage on /events or other routes while active organization is resolved.
    if (organizations.length > 0 && routeContext.mode !== 'create_org') {
      return (
        <div className="min-w-screen min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center font-sans space-y-3">
          <SEO robots="noindex, follow" />
          <div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs text-slate-400 font-medium">{t('common.loadingApp', undefined, 'Loading Event Game Studio...')}</p>
        </div>
      );
    }

    return (
      <>
        <SEO robots="noindex, follow" title={`${t('auth.createWorkspace', undefined, 'Create Workspace')} | Event Game Studio`} />
        <CreateOrganizationPage />
      </>
    );
  }

  // If routeContext.mode === 'create_org' remains true after creation, fix the route transition
  // rather than repeatedly rendering the creation page.
  if (routeContext.mode === 'create_org') {
    return (
      <div className="min-w-screen min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center font-sans space-y-3">
        <SEO robots="noindex, follow" />
        <div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-xs text-slate-400 font-medium">{t('common.enteringStudio', undefined, 'Entering Studio...')}</p>
      </div>
    );
  }

  // 8b. EXISTING ORGANIZATION MISSING COUNTRY CODE
  // Prompt owner/admin to select organization country upon login/access
  if (!currentOrganization.country_code) {
    return (
      <>
        <SEO robots="noindex, follow" />
        <SetOrganizationCountryModal organization={currentOrganization} />
      </>
    );
  }

  // 8c. MANDATORY THEME SETUP ONBOARDING ROUTE (/theme-setup)
  if (routeContext.mode === 'theme_setup') {
    return (
      <>
        <SEO robots="noindex, follow" title={`${t('onboarding.stepTheme', undefined, 'Theme Setup')} | Event Game Studio`} />
        <ThemeSetupOnboardingPage />
      </>
    );
  }

  // 9. PROTECTED STUDIO / DASHBOARD ROUTE (e.g. /events, /game-themes, /team, /wallet)
  return (
    <>
      <SEO robots="noindex, follow" />
      <DashboardLayout />
    </>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <NotificationProvider>
        <LocalizationProvider>
          <AppContent />
          <NotificationCenterModal />
        </LocalizationProvider>
      </NotificationProvider>
    </AuthProvider>
  );
}

