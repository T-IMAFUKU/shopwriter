"use client";
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

import * as React from "react";
import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  notifyInfo,
  notifySaved,
  notifyError,
} from "@/src/lib/notify";

// ▼ ここから先は、現状ファイルの本来の中身を残してください
// （フォームや useEffect の処理など既存の JSX コンテンツ）
