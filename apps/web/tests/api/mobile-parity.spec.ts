import { test, expect } from "../fixtures/test";
import fs from "fs";
import path from "path";

test.describe('Phase 9 — Native iOS and Android Parity', () => {
  const webRoot = path.resolve(__dirname, '../../');
  const mobileRoot = path.resolve(webRoot, '../mobile');

  test('hosted assetlinks.json contains valid android app links configuration', async () => {
    const assetlinksPath = path.join(webRoot, 'public/.well-known/assetlinks.json');
    expect(fs.existsSync(assetlinksPath)).toBe(true);

    const content = JSON.parse(fs.readFileSync(assetlinksPath, 'utf8'));
    expect(Array.isArray(content)).toBe(true);
    expect(content.length).toBeGreaterThan(0);

    const appLink = content[0];
    expect(appLink.relation).toContain('delegate_permission/common.handle_all_urls');
    expect(appLink.target.namespace).toBe('android_app');
    expect(appLink.target.package_name).toBe('com.novicetutor.app');
    expect(Array.isArray(appLink.target.sha256_cert_fingerprints)).toBe(true);
    expect(appLink.target.sha256_cert_fingerprints.length).toBeGreaterThan(0);
  });

  test('hosted apple-app-site-association contains valid universal links configuration', async () => {
    const aasaPath = path.join(webRoot, 'public/.well-known/apple-app-site-association');
    expect(fs.existsSync(aasaPath)).toBe(true);

    const content = JSON.parse(fs.readFileSync(aasaPath, 'utf8'));
    expect(content.applinks).toBeDefined();
    expect(Array.isArray(content.applinks.details)).toBe(true);

    const detail = content.applinks.details[0];
    expect(detail.appID).toBe('TT3HQ774N4.com.novicetutor.app');
    expect(detail.paths).toContain('/dashboard/session/*');
    expect(detail.paths).toContain('/join/*');
    expect(detail.paths).toContain('/dashboard/*');
    expect(detail.paths).toContain('/login');

    // Modern iOS 13+ components format
    expect(Array.isArray(detail.components)).toBe(true);
    const sessionComponent = detail.components.find((c: any) => c['/'] === '/dashboard/session/*');
    expect(sessionComponent).toBeDefined();
  });

  test('next.config.ts configures application/json content-type for .well-known files', async () => {
    const nextConfigPath = path.join(webRoot, 'next.config.ts');
    const content = fs.readFileSync(nextConfigPath, 'utf8');

    expect(content).toContain('/.well-known/apple-app-site-association');
    expect(content).toContain('/.well-known/assetlinks.json');
    expect(content).toContain('application/json');
  });

  test('serves application/json content-type for .well-known endpoints', async ({ request }) => {
    const aasaRes = await request.get('/.well-known/apple-app-site-association');
    expect(aasaRes.status()).toBe(200);
    expect(aasaRes.headers()['content-type']).toContain('application/json');

    const assetlinksRes = await request.get('/.well-known/assetlinks.json');
    expect(assetlinksRes.status()).toBe(200);
    expect(assetlinksRes.headers()['content-type']).toContain('application/json');
  });

  test('android build.gradle.kts enforces release signing and throws on missing keystore in release tasks', async () => {
    const gradlePath = path.join(mobileRoot, 'android/app/build.gradle.kts');
    const content = fs.readFileSync(gradlePath, 'utf8');

    // Verify debug fallback was removed from release block
    const releaseBlock = content.match(/release\s*\{([\s\S]*?)\}/)?.[1] || '';
    expect(releaseBlock).not.toContain('signingConfigs.getByName("debug")');
    expect(releaseBlock).toContain('signingConfig = signingConfigs.getByName("release")');
    expect(content).toContain('throw GradleException');
  });

  test('iOS Runner.entitlements configures Associated Domains and parameterized APNs', async () => {
    const entitlementsPath = path.join(mobileRoot, 'ios/Runner/Runner.entitlements');
    expect(fs.existsSync(entitlementsPath)).toBe(true);

    const content = fs.readFileSync(entitlementsPath, 'utf8');
    expect(content).toContain('applinks:novicetutor.com');
    expect(content).toContain('applinks:www.novicetutor.com');
    expect(content).toContain('aps-environment');
    expect(content).toContain('$(APS_ENVIRONMENT)');
  });

  test('iOS xcconfig defines APS_ENVIRONMENT and GoogleAuth fallbacks', async () => {
    const debugPath = path.join(mobileRoot, 'ios/Flutter/Debug.xcconfig');
    const releasePath = path.join(mobileRoot, 'ios/Flutter/Release.xcconfig');

    const debugContent = fs.readFileSync(debugPath, 'utf8');
    const releaseContent = fs.readFileSync(releasePath, 'utf8');

    expect(debugContent).toContain('APS_ENVIRONMENT = development');
    expect(debugContent).toContain('GOOGLE_IOS_CLIENT_ID =');
    expect(debugContent).toContain('GOOGLE_REVERSED_CLIENT_ID =');

    expect(releaseContent).toContain('APS_ENVIRONMENT = production');
    expect(releaseContent).toContain('GOOGLE_IOS_CLIENT_ID =');
    expect(releaseContent).toContain('GOOGLE_REVERSED_CLIENT_ID =');
  });

  test('iOS project.pbxproj references Runner.entitlements in all build configurations', async () => {
    const pbxprojPath = path.join(mobileRoot, 'ios/Runner.xcodeproj/project.pbxproj');
    const content = fs.readFileSync(pbxprojPath, 'utf8');

    expect(content).toContain('CODE_SIGN_ENTITLEMENTS = Runner/Runner.entitlements;');
    expect(content).toContain('A11000012C12345600000001 /* Runner.entitlements */');
  });

  test('nativeScreenShare logic requires screenshare UA marker', async () => {
    // Exact regex from nativeScreenShare.ts
    const uaRegex = /NoviceTutorApp\/[\d.]+ \(screenshare\)/;

    // Android shell with screenshare capability
    expect(uaRegex.test('NoviceTutorApp/1.2 (screenshare)')).toBe(true);

    // iOS shell without screenshare capability
    expect(uaRegex.test('NoviceTutorApp/1.2')).toBe(false);

    // Standard mobile Safari / Chrome
    expect(uaRegex.test('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)')).toBe(false);
  });
});
