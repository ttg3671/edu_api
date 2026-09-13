export const UserRole = {
  ADMIN: 'ADMIN',
  USER: 'USER'
}

export const UIStyle = {
  GRID: 'grid',
  LIST: 'list',
  SCROLL: 'scroll'
};

export const LayoutType = {
  HORIZONTAL_SCROLL: 'horizontal_scroll',
  VERTICAL_GRID: 'vertical_grid',
  FEATURED_HERO: 'featured_hero'
};

export const AspectRatio = {
  WIDE: '16:9',
  SQUARE: '1:1',
  TALL: '9:16'
};

export const VideoUIStyle = {
  HORIZONTAL: 'horizontal',
  VERTICAL: 'vertical'
};

export const SubscriptionStatus = {
  ACTIVE: 'active',
  EXPIRED: 'expired',
  CANCELLED: 'cancelled'
};

Object.freeze(UIStyle);
Object.freeze(LayoutType);
Object.freeze(AspectRatio);
Object.freeze(VideoUIStyle);
Object.freeze(SubscriptionStatus);
