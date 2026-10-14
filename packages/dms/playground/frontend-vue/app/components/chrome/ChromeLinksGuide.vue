<script setup lang="ts">
import ShowcaseDemo from "../showcase/ShowcaseDemo.vue";
import ShowcaseSection from "../showcase/ShowcaseSection.vue";
import SourceSnippet from "../showcase/SourceSnippet.vue";

/**
 * Frontend modules › Dashboard chrome › Footer & sign-in links: what the
 * playground adds to the screens a visitor sees before signing in.
 */

const SIGN_IN_PAGE = "login";

const { t } = useI18n();
const { links: footerLinks } = useFooterLinks();
const { links: authLinks } = useAuthLinks(SIGN_IN_PAGE);

interface RegisteredLink {
  id: string;
  label: string;
  to: string;
  order: number;
}

function linkItem(link: RegisteredLink) {
  return {
    label: t(link.label),
    value: link.to,
    type: "mono" as const,
    detail: `${link.id} · order ${link.order}`,
  };
}

const footerItems = computed(() => footerLinks.value.map(linkItem));
const authItems = computed(() => authLinks.value.map(linkItem));
</script>

<template>
  <div class="grid gap-16 pb-10">
    <ShowcaseSection
      id="links"
      title="Where they show"
      description="Footer links close the empty layout (the sign-in screens, the error pages), after the DMS's own Documentation and Website links; an id the DMS uses replaces its link. Auth links sit under the form of the page they name. Open the sign-in page in a private window to see both."
      :columns="1"
    >
      <ShowcaseDemo label="useFooterLinks().links">
        <DmsCard title="Footer" :count="footerItems.length">
          <DmsKeyValueList :items="footerItems" dense />
        </DmsCard>
      </ShowcaseDemo>
      <ShowcaseDemo label="useAuthLinks('login').links">
        <DmsCard title="Under the sign-in form" :count="authItems.length">
          <DmsKeyValueList :items="authItems" dense />
        </DmsCard>
      </ShowcaseDemo>
    </ShowcaseSection>

    <ShowcaseSection
      id="registration"
      title="Registration"
      description="Plain data, from a universal plugin, so the server renders the links. Labels are i18n keys without the $ prefix. An auth link is followed inside the app, so it points to a DMS page; a footer link may leave."
      :columns="1"
    >
      <ShowcaseDemo label="registerFooterLink · registerAuthLink" wide>
        <SourceSnippet path="plugins/sign-in-links-demo.ts" />
      </ShowcaseDemo>
    </ShowcaseSection>
  </div>
</template>
