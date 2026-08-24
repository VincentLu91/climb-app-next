"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

export default function DeleteSessionButton({ sessionId }) {
  const router = useRouter();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState(null);
  const isDeletingRef = useRef(false);

  function openModal() {
    setError(null);
    setIsModalOpen(true);
  }

  function closeModal() {
    if (isDeletingRef.current) {
      return;
    }
    setIsModalOpen(false);
    setError(null);
  }

  useEffect(() => {
    if (!isModalOpen) {
      return undefined;
    }

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        closeModal();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isModalOpen]);

  async function handleConfirmDelete() {
    if (isDeletingRef.current) {
      return;
    }
    isDeletingRef.current = true;
    setIsDeleting(true);
    setError(null);

    try {
      const response = await fetch(`/api/coaching-sessions/${sessionId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        setError(
          data.error || "Failed to delete this session. Please try again.",
        );
        isDeletingRef.current = false;
        setIsDeleting(false);
        return;
      }

      setIsModalOpen(false);
      router.replace("/upload");
      router.refresh();
    } catch (err) {
      console.error("Failed to delete coaching session:", err);
      setError("Failed to delete this session. Please try again.");
      isDeletingRef.current = false;
      setIsDeleting(false);
    }
  }

  function handleBackdropClick() {
    closeModal();
  }

  function handleModalClick(event) {
    event.stopPropagation();
  }

  return (
    <>
      <button
        type="button"
        className="delete-session-button"
        onClick={openModal}
        disabled={isDeleting}
      >
        Delete session
      </button>
      {isModalOpen ? (
        <div
          className="delete-session-modal-backdrop"
          onClick={handleBackdropClick}
        >
          <div
            className="delete-session-modal"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-session-heading"
            aria-describedby="delete-session-body"
            onClick={handleModalClick}
          >
            <h2 id="delete-session-heading">Delete this session?</h2>
            <p id="delete-session-body">
              This permanently deletes this session, its coaching conversation,
              analyses, and photos/videos. Your ongoing coaching progress will
              be kept.
            </p>
            {error ? (
              <p className="delete-session-modal-error">{error}</p>
            ) : null}
            <div className="delete-session-modal-actions">
              <button type="button" onClick={closeModal} disabled={isDeleting}>
                Cancel
              </button>
              <button
                type="button"
                className="delete-session-modal-confirm"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
              >
                {isDeleting ? "Deleting..." : "Delete permanently"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
