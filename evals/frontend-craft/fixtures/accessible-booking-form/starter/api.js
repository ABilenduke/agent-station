(() => {
  let retryAttempts = 0;
  window.archiveApi = {
    async reserve(booking) {
      await new Promise((resolve) => setTimeout(resolve, 900));
      if (booking.email === "unavailable@example.test") {
        throw new Error("The appointment service is unavailable. Please try again later.");
      }
      if (booking.email === "retry@example.test" && retryAttempts++ === 0) {
        throw new Error(
          "We could not send your request. Your details are safe here; please try again."
        );
      }
      return { reference: "NB-2046", ...booking };
    },
  };
})();
