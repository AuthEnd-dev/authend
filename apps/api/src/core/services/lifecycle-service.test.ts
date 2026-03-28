import { afterEach, describe, expect, test } from "bun:test";
import {
  resetExtensionLifecycleForTests,
  runExtensionBootstrapTasks,
  startExtensionRuntimeServices,
} from "./lifecycle-service";
import { forkBootstrapTasks, forkRuntimeServices } from "../../extensions/lifecycle";

afterEach(() => {
  forkBootstrapTasks.splice(0, forkBootstrapTasks.length);
  forkRuntimeServices.splice(0, forkRuntimeServices.length);
  resetExtensionLifecycleForTests();
});

describe("lifecycle service", () => {
  test("runs extension bootstrap tasks in declaration order", async () => {
    const executed: string[] = [];

    forkBootstrapTasks.push(
      {
        id: "first",
        async run() {
          executed.push("first");
        },
      },
      {
        id: "second",
        async run() {
          executed.push("second");
        },
      },
    );

    await runExtensionBootstrapTasks();

    expect(executed).toEqual(["first", "second"]);
  });

  test("starts extension runtime services only once", async () => {
    const executed: string[] = [];

    forkRuntimeServices.push({
      id: "service-a",
      async start() {
        executed.push("service-a");
      },
    });

    await startExtensionRuntimeServices();
    await startExtensionRuntimeServices();

    expect(executed).toEqual(["service-a"]);
  });
});
