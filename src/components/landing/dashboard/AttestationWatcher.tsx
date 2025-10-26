"use client";

import { useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useWatchContractEvent } from "wagmi";
import { useNotification } from "@blockscout/app-sdk";
import { EAS_CONTRACT_ADDRESS, EAS_ABI } from "@/lib/constants";
import { SEPOLIA_CHAIN_ID } from "@/lib/blockscout";
import { sepolia } from "wagmi/chains";

interface EventLog {
  transactionHash: string;
  logIndex: number;
}

/**
 * AttestationWatcher integrates Blockscout SDK with EAS contract event monitoring.
 *
 * Features:
 * - Listens to EAS "Attested" events in real-time on Sepolia
 * - Shows Blockscout transaction toast notifications for new attestations
 * - Auto-refreshes attestation queries when new events are detected
 * - Prevents duplicate event processing
 * - Works with backend-created transactions (doesn't need user wallet interaction)
 *
 * This showcases Blockscout SDK's transaction notification feature with
 * real-time blockchain event monitoring for a seamless UX.
 */
export function AttestationWatcher() {
  const queryClient = useQueryClient();
  const { openTxToast } = useNotification();
  const lastEventRef = useRef<string | null>(null);
  const processingRef = useRef<Set<string>>(new Set());

  useWatchContractEvent({
    address: EAS_CONTRACT_ADDRESS,
    abi: EAS_ABI,
    eventName: "Attested",
    chainId: sepolia.id,
    poll: true,
    pollingInterval: 2000,
    onLogs(logs) {
      if (!logs || logs.length === 0) return;
      console.log(
        "🎯 New attestation event detected:",
        logs.length,
        "event(s)"
      );

      logs.forEach((log: EventLog) => {
        const eventId = `${log.transactionHash}-${log.logIndex}`;

        // Avoid processing the same event twice
        if (
          lastEventRef.current === eventId ||
          processingRef.current.has(eventId)
        ) {
          console.log("⏭️  Skipping duplicate event:", eventId);
          return;
        }

        lastEventRef.current = eventId;
        processingRef.current.add(eventId);

        console.log("🔔 Processing new attestation:", {
          txHash: log.transactionHash,
          eventId,
        });

        // Show Blockscout transaction toast notification
        // This provides real-time feedback with transaction status tracking
        try {
          openTxToast(SEPOLIA_CHAIN_ID, log.transactionHash)
            .then(() => {
              console.log("✅ Blockscout toast shown for attestation");

              // Invalidate queries after toast is shown and blockchain has synced
              // This ensures the UI updates with the new attestation data
              setTimeout(() => {
                console.log("🔄 Refreshing attestation data...");
                queryClient.invalidateQueries({
                  queryKey: ["agent-attestations"],
                });
                queryClient.invalidateQueries({
                  queryKey: ["human-attestations"],
                });

                // Clean up processed event after refresh
                setTimeout(() => {
                  processingRef.current.delete(eventId);
                }, 5000);
              }, 2000);
            })
            .catch((error: any) => {
              // Ignore the SDK's internal boolean attribute error
              if (
                error?.message?.includes("show") ||
                error?.message?.includes("boolean")
              ) {
                console.warn(
                  "Blockscout SDK rendering warning (safe to ignore):",
                  error.message
                );
              } else {
                console.error("Failed to show Blockscout toast:", error);
              }
              // Still refresh data even if toast fails
              setTimeout(() => {
                queryClient.invalidateQueries({
                  queryKey: ["agent-attestations"],
                });
                queryClient.invalidateQueries({
                  queryKey: ["human-attestations"],
                });
                processingRef.current.delete(eventId);
              }, 2000);
            });
        } catch (err: any) {
          // Catch synchronous errors
          if (
            err?.message?.includes("show") ||
            err?.message?.includes("boolean")
          ) {
            console.warn(
              "Blockscout SDK rendering warning (safe to ignore):",
              err.message
            );
          } else {
            console.error("Error calling openTxToast:", err);
          }
          // Still refresh data
          setTimeout(() => {
            queryClient.invalidateQueries({
              queryKey: ["agent-attestations"],
            });
            queryClient.invalidateQueries({
              queryKey: ["human-attestations"],
            });
            processingRef.current.delete(eventId);
          }, 2000);
        }
      });
    },
  });

  return null;
}
