import { ROLES } from "./data/mockData";

export function roleHome(role) {
  switch (role) {
    case ROLES.ADMIN: return "/admin";
    case ROLES.PRINCIPAL: return "/principal";
    case ROLES.HOD: return "/hod";
    case ROLES.ADVISOR: return "/advisor";
    default: return "/student";
  }
}
