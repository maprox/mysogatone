import { createImportOrderPlugin } from "jsr:@ganitzsh/lint-import-order";

export default createImportOrderPlugin({
  sortImports: true,
  sortExports: true,
  spaceBetweenGroups: true,
});
