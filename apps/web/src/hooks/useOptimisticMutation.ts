import { useMutation, useQueryClient, type MutationOptions } from '@tanstack/react-query';
import { useToast } from './useToast';

/**
 * Options for useOptimisticMutation hook.
 */
interface UseOptimisticMutationOptions<TData, TError, TVariables, TContext> {
  /**
   * The mutation function to execute
   */
  mutationFn: (variables: TVariables) => Promise<TData>;
  /**
   * Query key(s) to invalidate on success
   */
  invalidateKeys?: unknown[][];
  /**
   * Called before the mutation runs - return optimistic data or context
   */
  onMutate?: (variables: TVariables) => Promise<TContext> | TContext;
  /**
   * Called on error - receives variables and context for rollback
   */
  onError?: (error: TError, variables: TVariables, context: TContext | undefined) => void;
  /**
   * Called on success
   */
  onSuccess?: (data: TData, variables: TVariables, context: TContext | undefined) => void;
  /**
   * Called when mutation settles (success or error)
   */
  onSettled?: (
    data: TData | undefined,
    error: TError | null,
    variables: TVariables,
    context: TContext | undefined
  ) => void;
  /**
   * Success message to show in toast (pass false to disable)
   */
  successMessage?: string | false;
  /**
   * Error message to show in toast (pass false to disable)
   * Can be a function to customize based on error
   */
  errorMessage?: string | ((error: TError) => string) | false;
}

/**
 * useOptimisticMutation - Wrapper for TanStack Query mutations with optimistic updates.
 *
 * Features:
 * - Automatic cache invalidation on success
 * - Optimistic updates with rollback on error
 * - Integrated toast notifications
 * - Loading state for button feedback
 *
 * Implements PRD requirements:
 * - Instant button feedback
 * - Server-side revert on failure
 * - Toast notifications for success/error
 *
 * @example
 * // Basic usage
 * const { mutate, isPending } = useOptimisticMutation({
 *   mutationFn: updateUser,
 *   invalidateKeys: [['users', userId]],
 *   successMessage: 'Profile updated',
 * });
 *
 * @example
 * // With optimistic update
 * const { mutate } = useOptimisticMutation({
 *   mutationFn: toggleFavorite,
 *   invalidateKeys: [['favorites']],
 *   onMutate: async (id) => {
 *     // Cancel outgoing queries
 *     await queryClient.cancelQueries({ queryKey: ['favorites'] });
 *     // Snapshot current data
 *     const previousData = queryClient.getQueryData(['favorites']);
 *     // Optimistically update
 *     queryClient.setQueryData(['favorites'], (old) =>
 *       old?.map(item => item.id === id ? { ...item, isFavorite: !item.isFavorite } : item)
 *     );
 *     return { previousData };
 *   },
 *   onError: (err, id, context) => {
 *     // Rollback on error
 *     queryClient.setQueryData(['favorites'], context?.previousData);
 *   },
 * });
 */
function useOptimisticMutation<
  TData = unknown,
  TError = Error,
  TVariables = void,
  TContext = unknown
>(options: UseOptimisticMutationOptions<TData, TError, TVariables, TContext>) {
  const queryClient = useQueryClient();
  const toast = useToast();

  const {
    mutationFn,
    invalidateKeys = [],
    onMutate,
    onError,
    onSuccess,
    onSettled,
    successMessage = 'Changes saved successfully',
    errorMessage = 'Something went wrong. Please try again.',
  } = options;

  const mutation = useMutation<TData, TError, TVariables, TContext>({
    mutationFn,

    onMutate: async (variables) => {
      // Call user's onMutate for optimistic updates
      if (onMutate) {
        return await onMutate(variables);
      }
      return undefined as unknown as TContext;
    },

    onError: (error, variables, context) => {
      // Show error toast
      if (errorMessage !== false) {
        const message =
          typeof errorMessage === 'function'
            ? errorMessage(error)
            : errorMessage;
        toast.error({ message });
      }

      // Call user's onError for rollback
      onError?.(error, variables, context);
    },

    onSuccess: (data, variables, context) => {
      // Show success toast
      if (successMessage !== false) {
        toast.success({ message: successMessage });
      }

      // Call user's onSuccess
      onSuccess?.(data, variables, context);
    },

    onSettled: async (data, error, variables, context) => {
      // Invalidate queries to refetch fresh data
      for (const key of invalidateKeys) {
        await queryClient.invalidateQueries({ queryKey: key });
      }

      // Call user's onSettled
      onSettled?.(data, error, variables, context);
    },
  });

  return {
    /**
     * Trigger the mutation
     */
    mutate: mutation.mutate,
    /**
     * Trigger the mutation and return a promise
     */
    mutateAsync: mutation.mutateAsync,
    /**
     * Whether the mutation is currently running (for button loading state)
     */
    isPending: mutation.isPending,
    /**
     * Whether the mutation has failed
     */
    isError: mutation.isError,
    /**
     * Whether the mutation has succeeded
     */
    isSuccess: mutation.isSuccess,
    /**
     * The error from the mutation (if any)
     */
    error: mutation.error,
    /**
     * The data returned from the mutation (if successful)
     */
    data: mutation.data,
    /**
     * Reset the mutation state
     */
    reset: mutation.reset,
    /**
     * Current status of the mutation
     */
    status: mutation.status,
  };
}

export { useOptimisticMutation };
export type { UseOptimisticMutationOptions };
