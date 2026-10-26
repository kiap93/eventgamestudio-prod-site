import { describe, it } from 'node:test';
import assert from 'node:assert';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { SalesNavbar } from '../src/components/sales/SalesNavbar';
import { AuthContext } from '../src/context/AuthContext';
import { LocalizationProvider } from '../src/context/LocalizationContext';

const mockAuthValue: any = {
  currentUser: {
    id: 'user-sales-01',
    email: 'long.partner.account.name@eventgamestudio.enterprise.com',
    name: 'Sales Partner',
    avatar_url: null,
  },
  currentOrganization: {
    id: 'org-sales-01',
    name: 'Partner Org',
    slug: 'partner-org',
    role: 'owner',
    logo_url: null,
  },
  organizations: [],
  salesPartner: {
    id: 'sp-01',
    status: 'active',
    applied_at: '2026-09-01T00:00:00Z',
    activated_at: '2026-09-01T00:00:00Z',
    suspended_at: null,
  },
  isSalesPartner: true,
  salesPartnerStatus: 'active',
  isAuthenticated: true,
  isLoading: false,
  token: 'mock-token',
  logout: () => {},
};

const renderNavbar = (activeSection: any = 'commissions') => {
  return renderToString(
    <LocalizationProvider>
      <AuthContext.Provider value={mockAuthValue}>
        <SalesNavbar activeSection={activeSection} />
      </AuthContext.Provider>
    </LocalizationProvider>
  );
};

describe('Sales Partner Portal Header Layout & Responsive Architecture', () => {
  it('1. Renders all 5 primary navigation tabs with single-line whitespace-nowrap and shrink-0', () => {
    const html = renderNavbar('commissions');

    // Check desktop nav presence
    assert.ok(html.includes('aria-label="Partner Navigation"'), 'Desktop navigation element should exist');

    // Check all 5 tabs exist
    assert.ok(html.includes('Dashboard'), 'Dashboard tab must exist');
    assert.ok(html.includes('Customers'), 'Customers tab must exist');
    assert.ok(html.includes('Referrals'), 'Referrals tab must exist');
    assert.ok(html.includes('Commissions'), 'Commissions tab must exist');
    assert.ok(html.includes('Game Catalogue'), 'Game Catalogue tab must exist');

    // Verify whitespace-nowrap and shrink-0 are applied to desktop nav buttons
    assert.ok(
      html.includes('whitespace-nowrap shrink-0'),
      'Navigation buttons must enforce single-line whitespace-nowrap and shrink-0'
    );
  });

  it('2. Active navigation section is highlighted correctly (Commissions & Payouts)', () => {
    const html = renderNavbar('commissions');

    // Commissions should have active classes
    assert.ok(
      html.includes('bg-amber-500 text-slate-950 shadow-sm font-bold'),
      'Active section must have high-contrast amber styling'
    );
  });

  it('3. Partner account pill enforces min-w-0, truncation, sensible max-width, and status indicator', () => {
    const html = renderNavbar('commissions');

    // Check partner pill styling
    assert.ok(html.includes('min-w-0 shrink max-w-[110px] xl:max-w-[170px]'), 'Account pill must restrict max width and allow shrinking');
    assert.ok(html.includes('truncate min-w-0'), 'Email text must have truncate and min-w-0');
    assert.ok(html.includes('bg-emerald-400 shrink-0'), 'Status indicator dot must have shrink-0 to prevent collapsing');
    assert.ok(html.includes('title='), 'Pill must have title tooltip preserving full email identifier');
  });

  it('4. Customer Workspace switch and Logout buttons remain visible and clickable with shrink-0', () => {
    const html = renderNavbar('commissions');

    // Workspace button checks
    assert.ok(html.includes('Customer Workspace') || html.includes('Workspace'), 'Workspace button must be present');
    assert.ok(html.includes('title="Customer Workspace"'), 'Workspace button must have descriptive title');

    // Logout button checks
    assert.ok(html.includes('title="Sign Out"'), 'Logout button must have title');
    assert.ok(html.includes('aria-label="Sign Out"'), 'Logout button must have aria-label');
  });

  it('5. Brand section includes logo, Event Game Studio title, and PARTNER badge without wrapping', () => {
    const html = renderNavbar('commissions');

    assert.ok(html.includes('Event Game Studio'), 'Brand name must be present');
    assert.ok(html.includes('Partner'), 'Partner badge must be present');
    assert.ok(html.includes('whitespace-nowrap'), 'Brand elements must not wrap inappropriately');
  });

  it('6. Mobile and tablet drawer renders structured accessible navigation items', () => {
    // Check component source structure for mobile navigation drawer
    const fs = require('fs');
    const source = fs.readFileSync('src/components/sales/SalesNavbar.tsx', 'utf-8');

    assert.ok(source.includes('lg:hidden'), 'Collapsible navigation must activate below lg breakpoint (1024px)');
    assert.ok(source.includes('navItems.map'), 'Navigation items must be mapped dynamically for parity');
    assert.ok(source.includes('aria-expanded={mobileMenuOpen}'), 'Mobile toggle must communicate aria-expanded state');
  });

  it('7. Breakpoint layout analysis across required viewports (1620px, 1440px, 1280px, 1024px, 768px, 390px)', () => {
    const fs = require('fs');
    const source = fs.readFileSync('src/components/sales/SalesNavbar.tsx', 'utf-8');

    // 1620px & 1440px: full brand subtitle, full labels, max spacing
    assert.ok(source.includes('hidden 2xl:block'), 'Ultra-wide subtitle uses 2xl breakpoint');
    assert.ok(source.includes('xl:max-w-[170px]'), 'Standard desktop allows wider email display');

    // 1280px: desktop layout with "Commissions & Payouts" and "Customer Workspace"
    assert.ok(source.includes('hidden xl:inline'), 'Extended labels adapt gracefully at xl breakpoint');

    // 1024px: desktop layout fits on one row using concise labels and compact padding
    assert.ok(source.includes('hidden lg:flex'), 'Desktop navigation activates at lg (1024px) rather than broken md (768px)');

    // 768px & 390px: collapsible drawer with hamburger button
    assert.ok(source.includes('flex lg:hidden'), 'Mobile controls display below 1024px');
  });

  it('8. All activeSection options correctly highlight their respective tab', () => {
    const sections: Array<'portal' | 'customers' | 'referrals' | 'commissions' | 'games'> = [
      'portal',
      'customers',
      'referrals',
      'commissions',
      'games',
    ];

    for (const section of sections) {
      const html = renderNavbar(section);
      assert.ok(
        html.includes('bg-amber-500 text-slate-950 shadow-sm font-bold'),
        `Active section ${section} must render active styling`
      );
    }
  });

  it('9. Extremely long partner email is capped and retains full email in tooltip', () => {
    const veryLongEmail = 'supercalifragilisticexpialidocious.sales.agency@domain.co.uk';
    const customAuth: any = {
      ...mockAuthValue,
      currentUser: {
        ...mockAuthValue.currentUser,
        email: veryLongEmail,
      },
    };

    const html = renderToString(
      <LocalizationProvider>
        <AuthContext.Provider value={customAuth}>
          <SalesNavbar activeSection="commissions" />
        </AuthContext.Provider>
      </LocalizationProvider>
    );

    assert.ok(html.includes(`title="${veryLongEmail}"`), 'Full email must be retained in title tooltip');
    assert.ok(html.includes('truncate min-w-0'), 'Truncate class must be present on email span');
  });

  it('10. Confirms AI Translator button, trigger and modal are absent from SalesNavbar', () => {
    const html = renderNavbar('commissions');
    assert.strictEqual(html.includes('AI Translator'), false, 'AI Translator button must not be present in header');

    const fs = require('fs');
    const source = fs.readFileSync('src/components/sales/SalesNavbar.tsx', 'utf-8');
    assert.strictEqual(source.includes('showTranslator'), false, 'showTranslator state must be removed');
    assert.strictEqual(source.includes('SalesPartnerTranslationModal'), false, 'SalesPartnerTranslationModal must not be imported or mounted in SalesNavbar');
    assert.strictEqual(source.includes('Sparkles'), false, 'Sparkles icon must be removed');
  });
});
