import { releaseKernelResources, type PageCleanupToken } from '../../kernel';

/** Collecting a world releases its engine resources without running application code. */
export const worldFinalizer = new FinalizationRegistry<PageCleanupToken>(releaseKernelResources);
