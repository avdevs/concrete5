<?php
namespace Concrete\Core\Page\View;

use Concrete\Core\Page\Theme\Theme;
use Environment;
use Events;
use Loader;
use PageCache;
use PageTemplate;
use PageTheme;
use Permissions;
use URL;
use User;
use View;
use Config;

class PageView extends View
{
    protected $c; // page
    protected $cp;
    protected $pTemplateID;
    protected $customStyleMap;

    public function getScopeItems()
    {
        $items = parent::getScopeItems();
        $items['c'] = $this->c;
        $items['theme'] = $this->themeObject;

        return $items;
    }

    /**
     * Called from previewing functions, this lets us override the page's template with one of our own choosing.
     */
    public function setCustomPageTemplate(PageTemplate $pt)
    {
        $this->pTemplateID = $pt->getPageTemplateID();
    }

    public function getPageTemplate()
    {
        return PageTemplate::getByID($this->pTemplateID);
    }

    /**
     * Called from previewing functions, this lets us override the page's theme with one of our own choosing.
     */
    public function setCustomPageTheme(PageTheme $pt)
    {
        $this->themeObject = $pt;
        $this->pkgHandle = $pt->getPackageHandle();
    }

    public function renderSinglePageByFilename($cFilename, $pkgHandle = null)
    {
        $env = Environment::get();
        $cFilename = trim($cFilename, '/');

        // if we have this exact template in the theme, we use that as the outer wrapper and we don't do an inner content file
        $exactThemeTemplate = $env->getRecord(DIRNAME_THEMES . '/' . $this->themeHandle . '/' . $cFilename, $this->pkgHandle);
        if ($exactThemeTemplate->exists()) {
            $this->setViewTemplate($exactThemeTemplate->file);
        } else {
            // use a content wrapper from themes/core if specified
            // e.g. $this->render('your/page', 'none') would use themes/core/none.php to print the $innerContent without a wrapper
            $coreThemeTemplate = $env->getRecord(DIRNAME_THEMES . '/' . DIRNAME_THEMES_CORE . '/' . $this->pkgHandle . '.php');
            if ($coreThemeTemplate->exists()) {
                $this->setViewTemplate($coreThemeTemplate->file);
            } else {
                // check for other themes or in a package if one was specified
                $themeTemplate = $env->getRecord(DIRNAME_THEMES . '/' . $this->themeHandle . '/' . $this->controller->getThemeViewTemplate(), $this->pkgHandle);
                if ($themeTemplate->exists()) {
                    $this->setViewTemplate($themeTemplate->file);
                } else {
                    // fall back to the active theme wrapper if nothing else was found
                    $fallbackTheme = Theme::getByHandle($this->themeHandle);
                    $fallbackPkgHandle = ($fallbackTheme instanceof Theme) ? $fallbackTheme->getPackageHandle() : $this->pkgHandle;
                    $fallbackTemplate = $env->getRecord(DIRNAME_THEMES . '/' . $this->themeHandle . '/' . $this->controller->getThemeViewTemplate(), $fallbackPkgHandle);
                    $path = $fallbackTemplate->file;
                    if (basename($path) != FILENAME_THEMES_VIEW) {
                        // We're going to check to see if this file actually exists in the theme. Otherwise we're going to use the default wrapper.
                        // Ideally this would happen in getThemeViewTemplate but it's hard to add the logic there.
                        if (!$fallbackTemplate->exists()) {
                            $path = $env->getPath(DIRNAME_THEMES . '/' . $this->themeHandle . '/' . FILENAME_THEMES_VIEW, $fallbackPkgHandle);
                        }
                    }
                    $this->setViewTemplate($path);
                }
            }

            // set the inner content for the theme wrapper we found
            if (!isset($pkgHandle)) { // This way we can pass in a false and skip this.
                $pkgHandle = $this->c->getPackageHandle();
            }

            $this->setInnerContentFile(
                $env->getPath(
                    DIRNAME_PAGES . '/' . $cFilename,
                    $pkgHandle
                )
            );
        }
    }

    public function setupRender()
    {
        $this->loadViewThemeObject();
        $env = Environment::get();

        if (isset($this->innerContentFile)) {
            // this has already been rendered (e.g. by calling $this->render()
            // from within a controller. So we don't reset it.
            return false;
        }

        if ($this->c->getPageTypeID() == 0 && $this->c->getCollectionFilename()) {
            $this->renderSinglePageByFilename($this->c->getCollectionFilename());
        } else {
            $pt = $this->getPageTemplate();
            $rec = null;
            if ($pt) {
                $rec = $env->getRecord(
                    DIRNAME_THEMES . '/' . $this->themeHandle . '/' . $pt->getPageTemplateHandle() . '.php',
                    $this->pkgHandle);
            }
            if ($rec && $rec->exists()) {
                $this->setViewTemplate(
                    $env->getPath(
                        DIRNAME_THEMES . '/' . $this->themeHandle . '/' . $pt->getPageTemplateHandle() . '.php',
                        $this->pkgHandle));
            } else {
                $rec = $env->getRecord(
                    DIRNAME_PAGE_TEMPLATES . '/' . $this->c->getPageTypeHandle() . '.php',
                    $this->pTemplatePkgHandle);
                if ($rec->exists()) {
                    $this->setInnerContentFile(
                        $env->getPath(
                            DIRNAME_PAGE_TEMPLATES . '/' . $this->c->getPageTypeHandle() . '.php',
                            $this->pTemplatePkgHandle));
                    $this->setViewTemplate(
                        $env->getPath(
                            DIRNAME_THEMES . '/' . $this->themeHandle . '/' . $this->controller->getThemeViewTemplate(),
                            $this->pkgHandle));
                } else {
                    $this->setViewTemplate(
                        $env->getPath(
                            DIRNAME_THEMES . '/' . $this->themeHandle . '/' . FILENAME_THEMES_DEFAULT,
                            $this->pkgHandle));
                }
            }
        }
    }

    public function getStyleSheet($stylesheet)
    {
        if ($this->themeObject->isThemePreviewRequest()) {
            return $this->themeObject->getStylesheet($stylesheet);
        }

        if ($this->c->hasPageThemeCustomizations()) {
            if ($this->c->getVersionObject()->isApproved()) {
                return URL::to('/ccm/system/css/page', $this->c->getCollectionID(), $stylesheet);
            } else {
                // this means that we're potentially viewing customizations that haven't been approved yet. So we're going to
                // pipe them all through a handler script, basically uncaching them.
                return URL::to('/ccm/system/css/page', $this->c->getCollectionID(), $stylesheet, $this->c->getVersionID());
            }
        }

        $env = Environment::get();
        $output = Config::get('concrete.cache.directory') . '/pages/' . $this->c->getCollectionID() . '/' . DIRNAME_CSS . '/' . $this->getThemeHandle();
        $relative = REL_DIR_FILES_CACHE . '/pages/' . $this->c->getCollectionID() . '/' . DIRNAME_CSS . '/' . $this->getThemeHandle();
        $r = $env->getRecord(
            DIRNAME_THEMES . '/' . $this->themeObject->getThemeHandle() . '/' . DIRNAME_CSS . '/' . $stylesheet,
            $this->themeObject->getPackageHandle());
        if ($r->exists()) {
            $sheetObject = new \Concrete\Core\StyleCustomizer\Stylesheet(
                $stylesheet,
                $r->file,
                $r->url,
                $output,
                $relative);
            if ($sheetObject->outputFileExists()) {
                return $sheetObject->getOutputRelativePath();
            }

            return $this->themeObject->getStylesheet($stylesheet);
        }

        /*
         * deprecated - but this is for backward compatibility. If we don't have a stylesheet in the css/
         * directory we just pass through and return the passed file in the current directory.
         */
        return $env->getURL(
            DIRNAME_THEMES . '/' . $this->themeObject->getThemeHandle() . '/' . $stylesheet,
            $this->themeObject->getPackageHandle()
        );
    }

    public function startRender()
    {
        parent::startRender();
        $this->c->outputCustomStyleHeaderItems();
        // do we have any custom menu plugins?
        $cp = new Permissions($this->c);
        $this->cp = $cp;
        if ($cp->canViewToolbar()) {
            $dh = Loader::helper('concrete/dashboard');
            if (!$dh->inDashboard()
                && $this->c->getCollectionPath() != '/page_not_found'
                && $this->c->getCollectionPath() != '/download_file'
                && $this->c->isActive() && !$this->c->isMasterCollection()) {
                $u = new User();
                $u->markPreviousFrontendPage($this->c);
            }
        }
    }

    public function finishRender($contents)
    {
        $contents = parent::finishRender($contents);

        $event = new \Symfony\Component\EventDispatcher\GenericEvent();
        $event->setArgument('contents', $contents);
        Events::dispatch('on_page_output', $event);
        $contents = $event->getArgument('contents');

        $cache = PageCache::getLibrary();
        $shouldAddToCache = $cache->shouldAddToCache($this);
        if ($shouldAddToCache) {
            $cache->set($this->c, $contents);
        }

        return $contents;
    }

    /**
     * @deprecated
     */
    public function getCollectionObject()
    {
        return $this->getPageObject();
    }

    public function getPageObject()
    {
        return $this->c;
    }

    public function section($url)
    {
        if (!empty($this->viewPath)) {
            $url = '/' . trim($url, '/');
            if (strpos($this->viewPath, $url) !== false && strpos($this->viewPath, $url) == 0) {
                return true;
            }
        }
    }

    protected function constructView($page)
    {
        $this->c = $page;
        parent::constructView($page->getCollectionPath());
        if (!isset($this->pTemplateID)) {
            $this->pTemplateID = $this->c->getPageTemplateID();
            $pto = $this->c->getPageTemplateObject();
            if ($pto && $pto->getPackageID()) {
                $this->pTemplatePkgHandle = $this->c->getPageTemplateObject()->getPackageHandle();
            }
        }
        if (!isset($this->pThemeID)) {
            $this->pThemeID = $this->c->getPageTemplateID();
        }
    }
}
