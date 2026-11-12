import { appOrigin, createInvitation, emailAddress, StaffError } from "../src/server/staff-store.mjs";

try {
  const origin = appOrigin();
  const email = emailAddress(process.argv[2]);
  const secret = createInvitation(email, "admin", true);
  console.log("Open this private, single-use link to set the first admin password:");
  console.log(origin + "/join#" + secret);
} catch (error) {
  console.error(error instanceof StaffError ? error.message : "Could not initialize staff setup. Check the database path and application origin.");
  process.exitCode = 1;
}
