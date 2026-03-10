/**
 * Returns the best available display name for the current authenticated user.
 * Reads first_name/last_name or display_name from user_metadata, falling back to email prefix.
 */
export const getUserDisplayName = (user) => {
  const meta = user?.user_metadata || {};
  const firstName = `${meta.first_name || ''}`.trim();
  const lastName = `${meta.last_name || ''}`.trim();
  if (firstName || lastName) return `${firstName} ${lastName}`.trim();

  const displayName = `${meta.display_name || meta.name || meta.full_name || ''}`.trim();
  if (displayName) return displayName;

  const local = `${user?.email || ''}`.split('@')[0].trim();
  return local || user?.email || '';
};

/**
 * Returns the best available display name for a league member object.
 * Reads .name from league_members, falling back to email prefix.
 */
export const getMemberDisplayName = (member) => {
  if (member?.name && member.name.trim()) return member.name.trim();
  const local = `${member?.email || ''}`.split('@')[0].trim();
  return local || 'Unknown';
};

export const getUserInitials = (user) => {
  const meta = user?.user_metadata || {};
  const firstName = `${meta.first_name || ''}`.trim();
  const lastName = `${meta.last_name || ''}`.trim();

  if (firstName || lastName) {
    const first = firstName.charAt(0);
    const last = lastName.charAt(0);
    return `${first}${last}`.toUpperCase() || 'U';
  }

  const displayName = `${meta.display_name || meta.name || meta.full_name || ''}`.trim();
  if (displayName) {
    const parts = displayName.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  }

  const local = `${user?.email || ''}`.split('@')[0].trim();
  if (!local) return 'U';
  const tokens = local.split(/[._-]+/).filter(Boolean);
  if (tokens.length >= 2) return `${tokens[0][0]}${tokens[tokens.length - 1][0]}`.toUpperCase();
  return local.slice(0, 2).toUpperCase();
};
