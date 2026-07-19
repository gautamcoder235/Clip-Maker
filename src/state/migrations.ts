
export interface Migration {
  fromVersion: number;
  toVersion: number;
  migrate(project: any): any;
}

export const ProjectMigrations: Migration[] = [
  {
    fromVersion: 1,
    toVersion: 2,
    migrate(project: any): any {
      console.log("Migrating project from version 1 to 2...");
      
      const migrated = { ...project };
      migrated.version = 2;

      // Ensure asset_settings exists
      if (!migrated.asset_settings) {
        migrated.asset_settings = {};
      }

      // Initialize effects array for each asset setting
      for (const assetId of Object.keys(migrated.asset_settings)) {
        const settings = migrated.asset_settings[assetId];
        if (settings && !settings.effects) {
          settings.effects = [];
        }
      }

      return migrated;
    }
  }
];

export class ProjectMigrationRunner {
  public static migrate(project: any): any {
    if (!project) return project;
    
    // Default version to 1 if not specified
    let currentVersion = typeof project.version === "number" ? project.version : 1;
    let migratedProject = { ...project };

    // Apply migrations sequentially
    let applied = true;
    while (applied) {
      applied = false;
      for (const migration of ProjectMigrations) {
        if (migration.fromVersion === currentVersion) {
          migratedProject = migration.migrate(migratedProject);
          currentVersion = migration.toVersion;
          applied = true;
          break;
        }
      }
    }

    return migratedProject;
  }
}
