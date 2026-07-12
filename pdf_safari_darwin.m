#import <Cocoa/Cocoa.h>
#import <PDFKit/PDFKit.h>
#import <WebKit/WebKit.h>
#import <string.h>

@interface FigaroPDFNavigationDelegate : NSObject <WKNavigationDelegate>
@property(nonatomic, assign) dispatch_semaphore_t completionSemaphore;
@property(nonatomic, strong) NSData *pdfData;
@property(nonatomic, strong) NSError *pdfError;
@end

@implementation FigaroPDFNavigationDelegate

- (void)finishWithError:(NSError *)error {
    if (self.pdfError == nil) {
        self.pdfError = error;
    }
    dispatch_semaphore_signal(self.completionSemaphore);
}

- (void)webView:(WKWebView *)webView didFinishNavigation:(WKNavigation *)navigation {
    if (@available(macOS 11.0, *)) {
        [webView createPDFWithConfiguration:nil completionHandler:^(NSData *data, NSError *error) {
            self.pdfData = data;
            [self finishWithError:error];
        }];
        return;
    }
    NSError *error = [NSError errorWithDomain:@"FigaroPDF"
                                         code:1
                                     userInfo:@{NSLocalizedDescriptionKey: @"Safari PDF export requires macOS 11 or newer."}];
    [self finishWithError:error];
}

- (void)webView:(WKWebView *)webView didFailProvisionalNavigation:(WKNavigation *)navigation withError:(NSError *)error {
    [self finishWithError:error];
}

- (void)webView:(WKWebView *)webView didFailNavigation:(WKNavigation *)navigation withError:(NSError *)error {
    [self finishWithError:error];
}

@end

static char *figaro_copy_error(NSString *message) {
    if (message == nil) {
        return NULL;
    }
    return strdup([message UTF8String]);
}

int figaro_render_safari_pdf(const char *input_path, const char *output_path, const char *read_access_path, char **error_message) {
    if (error_message != NULL) {
        *error_message = NULL;
    }
    if (input_path == NULL || output_path == NULL || read_access_path == NULL) {
        if (error_message != NULL) {
            *error_message = figaro_copy_error(@"Safari PDF export received an empty path.");
        }
        return 0;
    }

    __block FigaroPDFNavigationDelegate *delegate = nil;
    __block WKWebView *webView = nil;
    dispatch_semaphore_t ready = dispatch_semaphore_create(0);

    dispatch_async(dispatch_get_main_queue(), ^{
        @autoreleasepool {
            NSURL *inputURL = [NSURL fileURLWithPath:[NSString stringWithUTF8String:input_path]];
            NSURL *readAccessURL = [NSURL fileURLWithPath:[NSString stringWithUTF8String:read_access_path]];
            WKWebViewConfiguration *configuration = [[WKWebViewConfiguration alloc] init];
            webView = [[WKWebView alloc] initWithFrame:NSMakeRect(0, 0, 794, 1123) configuration:configuration];
            delegate = [[FigaroPDFNavigationDelegate alloc] init];
            delegate.completionSemaphore = ready;
            webView.navigationDelegate = delegate;

            // The temporary workspace is inside the vault. Restrict WebKit to
            // the vault root so shared print stylesheets and images can load,
            // but a note cannot use export to read unrelated machine files.
            [webView loadFileURL:inputURL allowingReadAccessToURL:readAccessURL];
        }
    });

    long waitResult = dispatch_semaphore_wait(ready, dispatch_time(DISPATCH_TIME_NOW, 45 * NSEC_PER_SEC));
    if (waitResult != 0) {
        if (error_message != NULL) {
            *error_message = figaro_copy_error(@"Safari PDF export timed out.");
        }
        return 0;
    }

    NSError *renderError = delegate.pdfError;
    NSData *pdfData = delegate.pdfData;
    if (renderError != nil || pdfData == nil || [pdfData length] == 0) {
        if (error_message != NULL) {
            NSString *message = renderError.localizedDescription ?: @"Safari did not produce PDF data.";
            *error_message = figaro_copy_error(message);
        }
        return 0;
    }

    // Do not write the raw NSData directly. WebKit's own MiniBrowser moved to
    // PDFDocument's writer because PDFKit preserves link annotations from
    // WKWebView's createPDF result when serialising the final document.
    PDFDocument *pdfDocument = [[PDFDocument alloc] initWithData:pdfData];
    NSURL *outputURL = [NSURL fileURLWithPath:[NSString stringWithUTF8String:output_path]];
    if (pdfDocument == nil || ![pdfDocument writeToURL:outputURL]) {
        if (error_message != NULL) {
            *error_message = figaro_copy_error(@"Safari could not write an annotated PDF file.");
        }
        return 0;
    }
    return 1;
}
