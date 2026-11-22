// The site's only icons, drawn by hand on a 24px grid with a 1.5px stroke,
// square caps and mitred joins. No icon library (Appendix A). Words are used
// wherever words work; these sit beside text, never alone in coloured boxes.
import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement>;

function Icon({ children, ...props }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="square"
      strokeLinejoin="miter"
      aria-hidden="true"
      focusable="false"
      className="icon"
      {...props}
    >
      {children}
    </svg>
  );
}

export const SearchIcon = (props: IconProps) => (
  <Icon {...props}>
    <circle cx="10.5" cy="10.5" r="6" />
    <path d="M15 15l5 5" />
  </Icon>
);

export const CartIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M3 4h2.5l2.2 10.5h10.6L20.5 7H7" />
    <circle cx="9" cy="19" r="1.25" />
    <circle cx="17" cy="19" r="1.25" />
  </Icon>
);

export const MenuIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M4 6.5h16M4 12h16M4 17.5h16" />
  </Icon>
);

export const CloseIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Icon>
);

export const ChevronIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M7 10l5 5 5-5" />
  </Icon>
);

export const PhoneIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M6.5 3.5h3l1.5 4-2 1.5a10 10 0 005 5l1.5-2 4 1.5v3a2 2 0 01-2 2A15.5 15.5 0 014.5 5.5a2 2 0 012-2z" />
  </Icon>
);

export const LocationIcon = (props: IconProps) => (
  <Icon {...props}>
    <path d="M12 21s-6.5-6.2-6.5-11a6.5 6.5 0 0113 0c0 4.8-6.5 11-6.5 11z" />
    <circle cx="12" cy="10" r="2.25" />
  </Icon>
);
