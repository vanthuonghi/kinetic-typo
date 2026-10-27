import { Config } from "@remotion/cli/config";
import { Video } from "./src/Video";

Config.setVideoImageFormat("jpeg");

export const remotionRoot = import.meta.dirname;
export const registerRoot = () => import("./src/Root");
