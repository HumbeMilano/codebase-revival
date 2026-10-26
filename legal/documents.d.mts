export const legalVersion: string;
export const documentState: {
  status: string;
  operatorKind: string;
  companyFormed: boolean;
  commercialLaunch: boolean;
  minimumAge: number;
  householdAdministratorAge: number;
  requiredBeforePublication: string[];
};
export const plans: Record<
  "free" | "pro",
  { name: string; limits: Record<"members" | "lists" | "devices" | "photos" | "widgets", number> }
>;
export const documents: Record<
  "terms" | "privacy" | "copyright",
  Record<"es" | "en", { title: string; notice: string; sections: [string, string][] }>
>;
