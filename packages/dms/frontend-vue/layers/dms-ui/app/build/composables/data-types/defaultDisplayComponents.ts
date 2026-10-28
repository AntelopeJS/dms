import { defineAsyncComponent } from "vue";

export const FilePreview = defineAsyncComponent(
  () => import("../../../components/table-view/FilePreview.vue"),
);

export const ImagePreview = defineAsyncComponent(
  () => import("../../../components/table-view/ImagePreview.vue"),
);

export const CascaderPath = defineAsyncComponent(
  () => import("../../../components/table-view/CascaderPath.vue"),
);

export const DisplayRichText = defineAsyncComponent(
  () => import("../../../components/form/components/DisplayRichText.vue"),
);

export const DisplayPassword = defineAsyncComponent(
  () => import("../../../components/form/components/DisplayPassword.vue"),
);

export const DisplayFile = defineAsyncComponent(
  () => import("../../../components/form/components/DisplayFile.vue"),
);

export const DisplayImage = defineAsyncComponent(
  () => import("../../../components/form/components/DisplayImage.vue"),
);

export const DisplayColor = defineAsyncComponent(
  () => import("../../../components/form/components/DisplayColor.vue"),
);
