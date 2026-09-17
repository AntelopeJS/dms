// The DMS interface root. It re-exports the public surface of the `dms`
// interface modules; the domain folders (`auth`, `base`, `notifications`,
// `html-render`) and the database layer (`db`, `data-controllers`) keep their
// own subpaths, since they register schemas and controllers as they evaluate.
//
// Modules that carry an `internal` implementation namespace are re-exported by
// name: `internal` is the hook `ImplementInterface` binds, every module declares
// its own, and merging them here would be both ambiguous and wrong. Reach it
// through the module's own subpath.
export {
  AttachmentField,
  AttachmentSaveRequest,
  AttachmentSaveResult,
  GetAttachmentValidationMetadata,
  SaveComponentFiles,
  TableViewAttachmentSaveRequest,
} from "./attachments";
export * from "./component";
export * from "./component-slots";
export * from "./constants";
export {
  AuthTenantMember,
  AuthTenantOwner,
  AuthUserWithPermission,
  TenantGuardOptions,
  TenantRequestGuardOptions,
  authenticateTenantRequest,
} from "./guards";
export * from "./hooks";
export {
  CleanupInviteExtensions,
  CollectInviteExtensionPayloads,
  DeliverInviteExtensions,
  HTTP_BAD_REQUEST,
  INVITE_EXTENSION_FIELD_SEPARATOR,
  INVITE_FORM_SLOT_ID,
  InviteAcceptHandler,
  InviteCleanupContext,
  InviteCleanupHandler,
  InviteCleanupReason,
  InviteDeliveryOptions,
  InviteExtensionContext,
  InviteExtensionEntry,
  InviteExtensionFieldId,
  InviteExtensionInfo,
  InviteExtensionOptions,
  InviteExtensionPayloads,
  InviteExtensionPlacement,
  InviteFieldContribution,
  RegisterInviteExtension,
  ResolvedInvitePlacement,
  getInviteExtension,
  inviteExtensionFieldId,
  listInviteExtensionEntries,
  listInviteExtensions,
  logInviteExtensionFailure,
  splitInviteExtensionFieldId,
} from "./invite-extensions";
export * from "./invite-membership";
export * from "./invite-replacement";
export * from "./invite-resolution";
export * from "./invites";
export {
  AddFrontendModule,
  AddFrontendModuleOptions,
  Category,
  CategoryInfo,
  ClearPageLayoutBySlug,
  DynamicMenuItem,
  DynamicMenuProviderInfo,
  DynamicMenuResolver,
  FrontendModuleMetadata,
  FrontendModuleOptions,
  FrontendModuleValue,
  FrontendRendererMetadata,
  GetComponentPermissionIds,
  GetFrontendModules,
  GetPageLayoutBySlug,
  GetPendingPageExtensions,
  GetPermissionId,
  GetRegisteredPageIds,
  MODULE_URL_PREFIX,
  MaybePromise,
  MenuItemQuery,
  MenuItemStatus,
  MenuItemType,
  MenuItemVariant,
  MenuOptions,
  ModuleInfo,
  NotifyMenuChanged,
  PageController,
  PageExtensionComponent,
  PageExtensionInfo,
  PageInfo,
  PageLayout,
  PageLayoutHandler,
  PageMetadata,
  PageSetupCleanup,
  PageSetupContext,
  PageSetupFunction,
  PageValidation,
  PendingPageExtension,
  ROOT_SLUG,
  RegisterDynamicMenuProvider,
  RegisterModule,
  RegisterPage,
  RegisterPageExtension,
  RootCategory,
  RootPageController,
  isInsideModule,
  modulesCategory,
  pagesCategory,
  settingsCategory,
} from "./page";
export {
  GetEffectiveUserPermissions,
  GetPermission,
  GetPermissions,
  GetUserPermissions,
  HasPermission,
  IsModuleScopedPermission,
  MarkModuleScopedPermission,
  Permission,
  PermissionTree,
  RegisterPermission,
  UnmarkModuleScopedPermission,
  UnregisterPermission,
} from "./permissions";
export {
  ApplyPermissionsResolvers,
  PermissionsResolverFn,
  PermissionsResolverInfo,
  RegisterPermissionsResolver,
} from "./permissions-resolver";
export {
  QuickAction,
  QuickActionCategory,
  QuickActionCategoryInfo,
  QuickActionInfo,
  QuickActionPageTarget,
  QuickActionTarget,
} from "./quick-actions";
export {
  PublishMessage,
  PublishMessageOptions,
  RealtimeMessage,
  RealtimeMessageHandler,
  RegisterPageTopic,
  SubscribeMessage,
  UnsubscribeMessage,
} from "./realtime";
export * from "./request-tenant";
export {
  AssertTenantAccess,
  CheckTenantAccess,
  GatedSurface,
  RegisterTenantAccessGate,
  TenantAccessGateFn,
  TenantAccessGateInfo,
  TenantAccessResult,
  gateAllowsSurface,
} from "./tenant-access";
export * from "./tenant-export";
export * from "./tenant-lifecycle";
export * from "./tenant-ownership";
export * from "./tenant-scoped-model";
export * from "./types";
export {
  NativeUploadFieldRegistration,
  SignUploadToken,
  StampUploadFieldTokens,
  UploadTokenClaims,
} from "./uploads";
