import React, { useEffect } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { useRouteContext, navigateTo } from './hooks/useRouteContext';
import { LoginPage } from './components/auth/LoginPage';
import { CreateOrganizationPage } from './components/auth/CreateOrganizationPage';
import { AcceptInvitePage } from './components/auth/AcceptInvitePage';
import { DashboardLayout } from './components/layout/DashboardLayout';
import { PublicEventGameView } from './components/events/PublicEventGameView';
import { DeveloperAdminPage } from './components/developer/DeveloperAdminPage';
import { LandingPage } from './components/landing/LandingPage';

const AppContent: React.FC = () => {
  const { isAuthenticated, isLoading, currentOrganization } = useAuth();
  const routeContext = useRouteContext();

  const isPublicRoute =
    routeContext.mode === 'public_event' ||
    routeContext.mode === 'accept_invite' ||
    routeContext.mode === 'landing';

  const isLoginRoute = routeContext.mode === 'login';
  const isProtectedRoute = !isPublicRoute && !isLoginRoute;

  // ROUTE GUARD: Enforce authentication constraints seamlessly across all routes
  useEffect(() => {
    // Wait until session restoration has finished
    if (isLoading) return;

    if (isAuthenticated) {
      // 1. Authenticated user visiting /login -> redirect automatically to /events
      if (isLoginRoute) {
        navigateTo('/events');
      }
    } else {
      // 2. Unauthenticated user visiting a protected route -> redirect automatically to /login
      if (isProtectedRoute) {
        navigateTo('/login');
      }
    }
  }, [isLoading, isAuthenticated, isLoginRoute, isProtectedRoute]);

  // 1. PUBLIC EVENT ROUTE: /e/:publicToken (Unauthenticated Public Player View)
  if (routeContext.mode === 'public_event') {
    return <PublicEventGameView />;
  }

  // 2. ACCEPT INVITE ROUTE
  if (routeContext.mode === 'accept_invite') {
    return <AcceptInvitePage />;
  }

  // 3. PUBLIC MARKETING LANDING PAGE: / (Accessible with or without authentication)
  if (routeContext.mode === 'landing') {
    return <LandingPage />;
  }

  // 4. AUTH & SESSION INITIALIZATION LOADING STATE
  if (isLoading) {
    return (
      <div className="min-w-screen min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center font-sans space-y-3">
        <div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-xs text-slate-400 font-medium">Loading Event Game Studio...</p>
      </div>
    );
  }

  // 5. UNAUTHENTICATED USERS: Always show LoginPage
  if (!isAuthenticated) {
    return <LoginPage />;
  }

  // 6. AUTHENTICATED GUARD FOR /login (Never render LoginPage when authenticated)
  if (isLoginRoute) {
    return (
      <div className="min-w-screen min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center font-sans space-y-3">
        <div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-xs text-slate-400 font-medium">Redirecting to Events...</p>
      </div>
    );
  }

  // 7. DEVELOPER ADMIN ROUTE
  if (routeContext.mode === 'developer_admin') {
    return <DeveloperAdminPage />;
  }

  // 8. ONBOARDING / CREATE ORGANIZATION ROUTE
  if (!currentOrganization || routeContext.mode === 'create_org') {
    return <CreateOrganizationPage />;
  }

  // 9. PROTECTED STUDIO / DASHBOARD ROUTE (e.g. /events, /game-themes, /team, /wallet)
  return <DashboardLayout />;
};

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

