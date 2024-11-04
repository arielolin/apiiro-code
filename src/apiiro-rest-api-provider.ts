import axios from "axios";
import vscode from "vscode";
import { decodeJwt } from "./utils/string";

const API_BASE_URL = `${getEnvironmentData().AppUrl}`;

function getEnvironmentData() {
  const token = getApiToken() as string;
  return decodeJwt(token);
}

function getApiToken(): string | null {
  const config = vscode.workspace.getConfiguration("apiiroCode");
  const token = config.get("token");
  if (!token) {
    vscode.window.showErrorMessage(
      "Please define the Apiiro API token in the settings.",
    );
    return null;
  }
  return token as string;
}

function createAxiosInstance(path: string) {
  const token = getApiToken();
  if (!token) {
    return null;
  }
  return axios.create({
    baseURL: API_BASE_URL + path,
    headers: {
      accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
  });
}

export const createApiiroRestApiClient = (path: string) =>
  createAxiosInstance(path);
