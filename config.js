// Non-secret identifiers. Safe to commit. Secrets live in .env only.

export const WIX = {
  siteId: process.env.WIX_SITE_ID || "b36dc4a6-8b3b-425b-864d-4f0ef7af61b9",
  timeSlotsEndpoint:
    "https://www.wixapis.com/_api/service-availability/v2/time-slots",
};

// GoHighLevel (CRM). Token is a secret and lives in env (GHL_API_TOKEN).
// The location ID is not a secret. Confirm it in GHL if leads don't land.
export const GHL = {
  locationId: process.env.GHL_LOCATION_ID || "0vdJmqV3VXu2eENTjxn7",
  apiBase: "https://services.leadconnectorhq.com",
  apiVersion: "2021-07-28",
  upsertEndpoint: "https://services.leadconnectorhq.com/contacts/upsert",
};

// Wix Bookings service IDs.
export const SERVICE_IDS = {
  private: "27cd2176-c478-4bd1-9093-e8f3258db023",
  semiPrivateCouples: "09e9bfb1-95ac-4b30-92e1-6aa57ac4d35e",
  redBallWesleyChapel: "a31c3896-6647-4034-a752-5b6ede5dc72c",
  redBallStPete: "957a0152-4e52-4c15-8623-8dccf350f6b5",
  orangeBallStPete: "5594ef78-0e08-42cb-9e81-aea16e6d96eb",
  greenDot: "47280c89-b65e-40d6-b766-261c7c422d05",
};

// Wix Bookings location IDs.
export const LOCATION_IDS = {
  countyLineRd: "169c2815-ca48-46f0-a2e4-65604941c7bd",
  saxonyWay: "90d48aff-8fe3-4c09-a6eb-ff66fea2c426",
  countryPointBlvd: "9ff78d3a-c2ea-4cb5-ba1d-65dc6a0290dc",
  puryearParkStPete: "9fd252a3-30de-465b-ab8b-c2c65b2bd88b",
};

// Public booking links the brain can hand out.
export const BOOKING_LINKS = {
  redBallWC:
    "https://www.vstennisacademy.com/booking-calendar/red-ball-program-wesley-chapel",
  orangeBallWC:
    "https://www.vstennisacademy.com/booking-calendar/orange-ball-wesley-chapel-program-1",
  greenBallWC:
    "https://www.vstennisacademy.com/booking-calendar/green-ball-wesley-chapel-program",
  adultsWC:
    "https://www.vstennisacademy.com/booking-calendar/group-classes-for-adults-wesley-chapel",
  private:
    "https://www.vstennisacademy.com/booking-calendar/personal-tennis-lesson",
  semiPrivateCouples:
    "https://www.vstennisacademy.com/booking-calendar/tennis-for-couples-semi-private-lessons",
  redBallStPete:
    "https://www.vstennisacademy.com/booking-calendar/red-ball-program-st-petersburg",
  allPlans: "https://www.vstennisacademy.com/plans-pricing",
  bookOnline: "https://www.vstennisacademy.com/book-online",
};
