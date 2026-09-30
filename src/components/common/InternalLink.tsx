import React from 'react';
import { navigateTo } from '../../hooks/useRouteContext';

export interface InternalLinkProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  href?: string;
  to?: string;
  children: React.ReactNode;
  className?: string;
  onClick?: (e: React.MouseEvent<HTMLAnchorElement>) => void;
}

/**
 * Crawlable internal link component that renders a genuine `<a href="...">`
 * for search engine spiders while preserving seamless client-side SPA navigation
 * for standard clicks. Supports Cmd/Ctrl/Shift/middle-click for opening new tabs.
 * Accepts either `to` or `href` prop interchangeably.
 */
export const InternalLink: React.FC<InternalLinkProps> = ({
  href,
  to,
  children,
  className = '',
  onClick,
  ...props
}) => {
  const targetUrl = to || href || '/';

  const handleClick = (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (onClick) {
      onClick(e);
    }

    // Allow user standard browser shortcuts (new tab, new window, middle click)
    if (
      e.defaultPrevented ||
      e.button !== 0 ||
      e.metaKey ||
      e.ctrlKey ||
      e.altKey ||
      e.shiftKey
    ) {
      return;
    }

    e.preventDefault();
    if (targetUrl) {
      navigateTo(targetUrl);
    }
  };

  return (
    <a
      href={targetUrl}
      onClick={handleClick}
      className={`cursor-pointer ${className}`}
      {...props}
    >
      {children}
    </a>
  );
};

