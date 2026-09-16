export default defineDmsPlugin(() => {
  const interfaceScale = useInterfaceScale();

  useHead({
    htmlAttrs: {
      "data-scale": interfaceScale,
    },
  });
});
