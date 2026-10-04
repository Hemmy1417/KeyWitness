/**
 * Lets the scripts import the web app's own TypeScript modules (the act
 * rules, the receipt canonical form) so a live proof checks the exact code
 * the app runs. Node strips the types; this only supplies the ".ts" the
 * app's extensionless imports leave out.
 */
export async function resolve(specifier, context, next) {
  try {
    return await next(specifier, context);
  } catch (e) {
    if (specifier.startsWith(".") && !/\.[a-z]+$/i.test(specifier)) return next(`${specifier}.ts`, context);
    throw e;
  }
}
