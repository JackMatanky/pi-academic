import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { Type } from "typebox";

import {
  loadProfile,
  migrateJsonProfile,
  updateProfile,
} from "../../lib/profile.js";
import { ProfilePatchSchema } from "../../lib/types.js";
import { fail, registerTool } from "../core/tool-kit.js";

const PROFILE_PATH = ".academic-writer/profile.md";

/**
 * Registers profile migration, read, and patch tools.
 *
 * @param pi - Pi extension API used to register tools.
 */
export function registerProfileTools(pi: ExtensionAPI): void {
  registerTool(pi, {
    name: "academic_writer_migrate_profile",
    effect: "write",
    label: "Academic Writer Migrate Profile",
    description:
      "One-time migration from .academic-writer/profile.json to .academic-writer/profile.md. Use during init/setup preflight before checking for an existing profile.",
    parameters: Type.Object({}),
    run: (_params, { cwd }) => {
      const migration = migrateJsonProfile(cwd);

      if (!migration.ok) {
        return fail(`Profile migration failed: ${migration.error}`, migration);
      }

      return {
        text: migration.migrated
          ? "Migrated JSON Academic Writer profile"
          : `Profile migration skipped: ${migration.reason}`,
        details: migration,
      };
    },
  });

  registerTool(pi, {
    name: "academic_writer_get_profile",
    effect: "read",
    core: true,
    label: "Academic Writer Get Profile",
    description:
      "Read and parse .academic-writer/profile.md into deterministic JSON for skills and agents. Use instead of regex or Python profile parsing.",
    parameters: Type.Object({}),
    failure: "Academic Writer profile is unreadable",
    run: (_params, { cwd }) => {
      const profile = loadProfile(cwd);

      if (!profile) {
        return fail("Academic Writer profile missing", {
          ok: false,
          path: PROFILE_PATH,
        });
      }

      return {
        text: JSON.stringify(profile, null, 2),
        details: { ok: true, path: PROFILE_PATH, profile },
      };
    },
  });

  registerTool(pi, {
    name: "academic_writer_update_profile",
    effect: "write",
    label: "Academic Writer Update Profile",
    description:
      "Patch recognized .academic-writer/profile.md fields using a structured object. Preserves the existing markdown profile shape and updates updatedAt when omitted.",
    parameters: Type.Object({ fieldsJson: ProfilePatchSchema }),
    failure: "Profile update failed",
    run: async ({ fieldsJson }, { cwd }) => {
      const profile = await updateProfile(cwd, fieldsJson);

      if (!profile) {
        return fail("Profile update failed: profile missing", {
          ok: false,
          path: PROFILE_PATH,
        });
      }

      return {
        text: "Profile updated",
        details: { ok: true, path: PROFILE_PATH, profile },
      };
    },
  });
}
