import { releaseByToken, type CleanupToken } from '../handles';

/** Collecting a world releases its handle pages without running application code. */
export const worldFinalizer = new FinalizationRegistry<CleanupToken>(releaseByToken);
