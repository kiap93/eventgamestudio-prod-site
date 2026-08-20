import React from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { useRouteContext } from './hooks/useRouteContext';
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

  // 4. STUDIO / ADMIN / DEVELOPER ROUTES (Require Authentication)
  if (isLoading) {
    return (
      <div className="min-w-screen min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center font-sans space-y-3">
        <div className="w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-xs text-slate-400 font-medium">Loading Event Game Studio...</p>
      </div>
    );
  }

  if (!isAuthenticated || routeContext.mode === 'login') {
    return <LoginPage />;
  }

  // 5. DEVELOPER ADMIN ROUTE
  if (routeContext.mode === 'developer_admin') {
    return <DeveloperAdminPage />;
  }

  if (!currentOrganization || routeContext.mode === 'create_org') {
    return <CreateOrganizationPage />;
  }

  return <DashboardLayout />;
};

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

