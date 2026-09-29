import React from 'react';
import { navigateTo } from '../../hooks/useRouteContext';

export interface InternalLinkProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string;
  children: React.ReactNode;
  className?: string;
  onClick?: (e: React.MouseEvent<HTMLAnchorElement>) => void;
}

/**
 * Crawlable internal link component that renders a genuine `<a href="...">`
 * for search engine spiders while preserving seamless client-side SPA navigation
 * for standard clicks. Supports Cmd/Ctrl/Shift/middle-click for opening new tabs.
 */
export const InternalLink: React.FC<InternalLinkProps> = ({
  href,
  children,
  className = '',
  onClick,
  ...props
}) => {
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
    navigateTo(href);
  };

  return (
    <a href={href} onClick={handleClick} className={className} {...props}>
      {children}
    </a>
  );
};
