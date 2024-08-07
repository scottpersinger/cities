window.getParams = async () => {
  let params = Object.fromEntries(new URLSearchParams(location.search));

  if (!params || !params.conversionId) {
    console.log("conversion query note string found");
    params.conversionId = "a0A4L00000642kXUAQ";
    await $setUser("conversionId", "a0A4L00000642kXUAQ");
    params = Object.fromEntries(new URLSearchParams(location.search));
  } else {
    console.log("conversion query string found");
    await $setUser("conversionId", params.conversionId);
  }

  $setUser("params", params);

  return params;
};
