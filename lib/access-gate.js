export const ACCESS_COOKIE_NAME = "vn_access_code";
export const ACCESS_NEXT_PARAM = "next";
export const ACCESS_PAGE_PATH = "/access";
export const ACCESS_API_PATH = "/api/access";

export function getRequiredAccessCode() {
  return (process.env.ACCESS_CODE || "").trim();
}

export function isValidAccessCode(candidate) {
  const required = getRequiredAccessCode();
  if (!required) return false;
  return String(candidate || "") === required;
}

export function buildAccessCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365 * 20,
  };
}
