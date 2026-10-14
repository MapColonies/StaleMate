import { type ConfigInstance, config } from '@map-colonies/config';
import { configSchema, type ConfigSchemaType } from './configSchema';

type ConfigType = ConfigInstance<ConfigSchemaType>;

let configInstance: ConfigType | undefined;

/**
 * Initializes the configuration from the local config files and the environment.
 * This should only be called from the instrumentation file.
 * @returns A Promise that resolves when the configuration is successfully initialized.
 */
async function initConfig(offlineMode?: boolean): Promise<void> {
  configInstance = await config({
    schema: configSchema,
    offlineMode,
  });
}

function getConfig(): ConfigType {
  if (!configInstance) {
    throw new Error('config not initialized');
  }
  return configInstance;
}

export { getConfig, initConfig, type ConfigType };
