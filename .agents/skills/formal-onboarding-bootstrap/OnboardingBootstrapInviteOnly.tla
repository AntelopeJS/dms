--------------------- MODULE OnboardingBootstrapInviteOnly ---------------------
(***************************************************************************)
(* The same model on an instance where accounts come only from             *)
(* invitations: auth.oauth.allowAccountCreation is off, its default        *)
(* (oauth/config.ts:16, 45-46). OnboardingBootstrapInviteOnly.cfg sets     *)
(* OAuthSignup = FALSE.                                                     *)
(***************************************************************************)
EXTENDS OnboardingBootstrap
=============================================================================
